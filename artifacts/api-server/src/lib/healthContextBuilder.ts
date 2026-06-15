import type { IHealthMemory } from "../models/HealthMemory";
import { sanitizeClinicalContext } from "./clinicalSafetyGuard";
import { buildSafeClinicalPrompt } from "./clinicalPromptGuard";
import type { IClinicalSummary } from "../models/ClinicalSummaryCache";

export interface HealthContextSummary {
  hasMedicalData: boolean;
  medications: string[];
  unverifiedMedications: string[];
  allergies: string[];
  conditions: string[];
  restrictions: string[];
  criticalEvents: string[];
  surgeries: string[];
  recordCount: number;
}

export function extractContextSummary(memory: IHealthMemory | null): HealthContextSummary {
  if (!memory || memory.recordCount === 0) {
    return {
      hasMedicalData: false,
      medications: [],
      unverifiedMedications: [],
      allergies: [],
      conditions: [],
      restrictions: [],
      criticalEvents: [],
      surgeries: [],
      recordCount: 0,
    };
  }

  return {
    hasMedicalData: true,
    medications: memory.currentMedications.map(m => {
      const parts = [m.name];
      if (m.dosage) parts.push(m.dosage);
      if (m.frequency) parts.push(m.frequency);
      return parts.join(" ");
    }),
    unverifiedMedications: memory.unverifiedMedications.map(m => {
      const parts = [m.name];
      if (m.dosage) parts.push(m.dosage);
      if (m.frequency) parts.push(m.frequency);
      return parts.join(" ");
    }),
    allergies: memory.allergies.map(a => a.value),
    conditions: memory.chronicConditions.map(c => c.value),
    restrictions: memory.medicationRestrictions.map(r => r.value),
    criticalEvents: memory.criticalEvents.map(e => e.value),
    surgeries: memory.surgeries.map(s => s.value),
    recordCount: memory.recordCount,
  };
}

export function buildHealthContextBlock(memory: IHealthMemory | null): string {
  const summary = extractContextSummary(memory);

  if (!summary.hasMedicalData) {
    return "PATIENT HEALTH PROFILE: No medical records uploaded yet. Responses are based on general medical knowledge only.";
  }

  const lines: string[] = [
    `PATIENT HEALTH PROFILE (extracted from ${summary.recordCount} uploaded medical record(s)):`,
  ];

  if (summary.allergies.length > 0) {
    lines.push(`• Known Allergies: ${summary.allergies.join(", ")}`);
  } else {
    lines.push("• Known Allergies: None documented");
  }

  if (summary.medications.length > 0) {
    lines.push(`• Verified Medications: ${summary.medications.join("; ")}`);
  }
  if (summary.unverifiedMedications.length > 0) {
    lines.push(`• Medications (OCR-extracted, needs physician review): ${summary.unverifiedMedications.join("; ")}`);
  }
  if (summary.medications.length === 0 && summary.unverifiedMedications.length === 0) {
    lines.push("• Medications: None documented");
  }

  if (summary.conditions.length > 0) {
    lines.push(`• Chronic Conditions: ${summary.conditions.join(", ")}`);
  }

  if (summary.restrictions.length > 0) {
    lines.push(`• Medication Restrictions: ${summary.restrictions.join("; ")}`);
  }

  if (summary.surgeries.length > 0) {
    lines.push(`• Surgical History: ${summary.surgeries.join("; ")}`);
  }

  if (summary.criticalEvents.length > 0) {
    lines.push(`• Critical Health Events: ${summary.criticalEvents.join("; ")}`);
  }

  return lines.join("\n");
}

export function buildSystemPrompt(memory: IHealthMemory | null, rawClinicalSummary?: IClinicalSummary): string {
  const healthBlock = buildHealthContextBlock(memory);

  let clinicalSection = "";
  if (rawClinicalSummary) {
    const sanitized = sanitizeClinicalContext(rawClinicalSummary);
    const safeBlock = buildSafeClinicalPrompt(sanitized);
    clinicalSection = `\n\n${safeBlock}\n`;
  }

  return `You are MediNova AI, a personal health assistant integrated with the user's personal health records. Your role is to help users understand their health information, answer general health questions, and guide them toward appropriate professional care.

${healthBlock}${clinicalSection}

ABSOLUTE RULES — NEVER VIOLATE UNDER ANY CIRCUMSTANCES:
1. NEVER diagnose diseases, medical conditions, or interpret test results as diagnostic conclusions.
2. NEVER prescribe, recommend, or suggest specific medications, dosages, or treatment plans.
3. For any message containing symptoms of a medical emergency (chest pain, difficulty breathing, stroke symptoms, severe bleeding, loss of consciousness, overdose, suicidal thoughts), ALWAYS instruct the user to call emergency services (911 or local equivalent) IMMEDIATELY as the very first part of your response.
4. Always recommend the user consult a qualified healthcare provider for any medical decision.
5. You MAY reference the patient's documented health profile to provide contextually relevant general information (e.g., "I see your records mention Metformin — here is some general information about diabetes management...").
6. Clearly distinguish between what is documented in the patient's personal records and what is general health knowledge.
7. Be empathetic, clear, and use plain, accessible language — avoid excessive medical jargon.
8. If the patient's documented allergies are relevant to a question, always highlight this prominently.

DISCLAIMER: You are an AI assistant providing general health information only. Nothing you say constitutes medical advice, diagnosis, or treatment.`;
}
