import mongoose from "mongoose";
import OpenAI from "openai";
import { HealthMemory } from "../models/HealthMemory";
import { ClinicalSummaryCache, type IClinicalSummary } from "../models/ClinicalSummaryCache";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function buildRawSummary(memory: Awaited<ReturnType<typeof HealthMemory.findOne>>): IClinicalSummary {
  if (!memory) {
    return {
      majorAllergies: [],
      chronicConditions: [],
      medicalEvents: [],
      medications: [],
      criticalHealthRisks: [],
      importantRestrictions: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const medications = [
    ...memory.currentMedications.map(m => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      confidence: "verified",
    })),
    ...memory.unverifiedMedications.map(m => ({
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      confidence: "unverified",
    })),
  ];

  // Derive critical health risks from conditions + events
  const riskConditions = new Set([
    "diabetes",
    "hypertension",
    "heart disease",
    "coronary artery disease",
    "stroke",
    "kidney disease",
    "liver disease",
    "copd",
    "asthma",
    "cancer",
    "epilepsy",
    "seizure",
    "thyroid",
    "autoimmune",
    "hiv",
  ]);
  const criticalHealthRisks = memory.chronicConditions
    .filter(c => riskConditions.has(c.value.toLowerCase()))
    .map(c => c.value);

  // Merge in critical events as additional risks
  memory.criticalEvents.forEach(e => {
    if (!criticalHealthRisks.includes(e.value)) criticalHealthRisks.push(e.value);
  });

  return {
    majorAllergies: memory.allergies.map(a => a.value),
    chronicConditions: memory.chronicConditions.map(c => c.value),
    medicalEvents: [
      ...memory.surgeries.map(s => s.value),
      ...memory.criticalEvents.map(e => e.value),
    ],
    medications,
    criticalHealthRisks,
    importantRestrictions: memory.medicationRestrictions.map(r => r.value),
    generatedAt: new Date().toISOString(),
  };
}

async function refineWithOpenAI(rawSummary: IClinicalSummary): Promise<IClinicalSummary> {
  const apiKey = process.env["OPENAI_API_KEY"];
  const provider = (process.env["AI_PROVIDER"] ?? "mock").toLowerCase().trim();

  if (provider !== "openai" || !apiKey) return rawSummary;

  try {
    const client = new OpenAI({ apiKey, timeout: 20_000 });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a clinical summarization engine.

Convert raw patient health data into a concise, doctor-facing clinical summary.

Rules:
- Do NOT diagnose
- Do NOT prescribe
- Do NOT add new medical facts
- Only reorganize and clarify the given data
- Normalize medication and condition names to standard medical terminology
- Output must be valid JSON matching this exact shape:
{
  "majorAllergies": [],
  "chronicConditions": [],
  "medicalEvents": [],
  "medications": [{"name":"","dosage":"","frequency":"","confidence":""}],
  "criticalHealthRisks": [],
  "importantRestrictions": [],
  "generatedAt": ""
}`,
        },
        {
          role: "user",
          content: JSON.stringify(rawSummary),
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text) as IClinicalSummary;
    parsed.generatedAt = rawSummary.generatedAt;
    return parsed;
  } catch {
    return rawSummary;
  }
}

export async function generateClinicalSummary(userId: string): Promise<IClinicalSummary> {
  const userOid = new mongoose.Types.ObjectId(userId);

  // Check cache first
  const cached = await ClinicalSummaryCache.findOne({ userId: userOid });
  if (cached && cached.expiresAt > new Date()) {
    return cached.summary as IClinicalSummary;
  }

  const memory = await HealthMemory.findOne({ userId: userOid });
  const rawSummary = buildRawSummary(memory);
  const finalSummary = await refineWithOpenAI(rawSummary);

  // Upsert cache
  await ClinicalSummaryCache.findOneAndUpdate(
    { userId: userOid },
    {
      userId: userOid,
      summary: finalSummary,
      expiresAt: new Date(Date.now() + CACHE_TTL_MS),
    },
    { upsert: true, new: true }
  );

  return finalSummary;
}

export function formatClinicalSummaryForPrompt(summary: IClinicalSummary): string {
  return `CLINICAL SUMMARY (DOCTOR VIEW — for contextual understanding only):
${JSON.stringify(summary, null, 2)}

Use this ONLY for contextual understanding of the patient's background.
Do NOT expose the raw structured JSON to the user unless they explicitly ask for a summary of their records.`;
}
