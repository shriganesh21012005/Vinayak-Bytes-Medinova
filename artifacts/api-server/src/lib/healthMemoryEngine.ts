import mongoose from "mongoose";
import { HealthMemory, type IHealthMemory, type IMemoryItem, type IMedicationItem } from "../models/HealthMemory";
import { HealthRecord } from "../models/HealthRecord";
import type { IMemorySignals, IMedicine } from "../models/HealthRecord";
import { extractMemorySignals } from "./memorySignals";

const SURGERY_KEYWORDS = [
  "surgery", "surgical", "operation", "operative", "resection",
  "transplant", "bypass", "appendectomy", "cholecystectomy", "mastectomy",
  "hysterectomy", "gastrectomy", "colectomy", "nephrectomy", "lobectomy",
  "amputation", "laparoscopy", "laparotomy", "cesarean", "c-section",
  "angioplasty", "stenting", "arthroplasty", "excision", "biopsy",
];

const RESTRICTION_KEYWORDS = [
  "contraindicated", "do not use", "avoid", "restricted", "prohibited",
  "not recommended", "do not take", "allerg", "hypersensitive",
  "medication restriction", "drug restriction",
];

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function isSurgical(value: string): boolean {
  const lower = value.toLowerCase();
  return SURGERY_KEYWORDS.some(kw => lower.includes(kw));
}

function isRestriction(value: string): boolean {
  const lower = value.toLowerCase();
  return RESTRICTION_KEYWORDS.some(kw => lower.includes(kw));
}

function mergeMemoryItems(
  existing: IMemoryItem[],
  newValues: string[],
  recordId: mongoose.Types.ObjectId,
  now: Date
): IMemoryItem[] {
  // Explicitly extract fields — spread on Mongoose subdocuments returns empty objects
  // because schema fields live behind prototype getters, not as own enumerable props.
  const result: IMemoryItem[] = existing.map(item => ({
    value: item.value,
    sourceRecordIds: [...(item.sourceRecordIds ?? [])],
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
  }));
  const existingKeys = new Map(result.map((item, i) => [normalizeKey(item.value), i]));

  for (const val of newValues) {
    const trimmed = val.trim();
    if (!trimmed || trimmed.length < 2) continue;

    const key = normalizeKey(trimmed);
    const idx = existingKeys.get(key);

    if (idx !== undefined) {
      const entry = result[idx];
      if (!entry.sourceRecordIds.some(id => id.equals(recordId))) {
        entry.sourceRecordIds.push(recordId);
      }
      entry.lastSeenAt = now;
    } else {
      result.push({
        value: trimmed,
        sourceRecordIds: [recordId],
        firstSeenAt: now,
        lastSeenAt: now,
      });
      existingKeys.set(key, result.length - 1);
    }
  }

  return result;
}

function mergeMedications(
  existing: IMedicationItem[],
  newMeds: Array<{ name: string; dosage?: string; frequency?: string; confidence: "verified" | "unverified" }>,
  recordId: mongoose.Types.ObjectId,
  now: Date
): IMedicationItem[] {
  // Explicitly extract fields — spread on Mongoose subdocuments returns empty objects
  // because schema fields live behind prototype getters, not as own enumerable props.
  const result: IMedicationItem[] = existing.map(item => ({
    name: item.name,
    dosage: item.dosage,
    frequency: item.frequency,
    confidence: item.confidence,
    sourceRecordIds: [...(item.sourceRecordIds ?? [])],
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
  }));
  const existingKeys = new Map(result.map((item, i) => [normalizeKey(item.name), i]));

  for (const med of newMeds) {
    if (!med.name || med.name.trim().length < 2) continue;

    const key = normalizeKey(med.name);
    const idx = existingKeys.get(key);

    if (idx !== undefined) {
      const entry = result[idx];
      if (!entry.sourceRecordIds.some(id => id.equals(recordId))) {
        entry.sourceRecordIds.push(recordId);
      }
      if (med.dosage) entry.dosage = med.dosage;
      if (med.frequency) entry.frequency = med.frequency;
      entry.lastSeenAt = now;
    } else {
      result.push({
        name: med.name.trim(),
        dosage: med.dosage,
        frequency: med.frequency,
        confidence: med.confidence,
        sourceRecordIds: [recordId],
        firstSeenAt: now,
        lastSeenAt: now,
      });
      existingKeys.set(key, result.length - 1);
    }
  }

  return result;
}

function buildCondensedProfile(memory: IHealthMemory): string {
  const date = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  function listOrNone(items: { value: string }[]): string {
    if (!items.length) return "None documented";
    return items.map(i => `• ${i.value}`).join("\n");
  }

  function medListOrNone(meds: IMedicationItem[], label?: string): string {
    if (!meds.length) return label ? "" : "None documented";
    return meds.map(m => {
      const parts = [m.name];
      if (m.dosage) parts.push(m.dosage);
      if (m.frequency) parts.push(m.frequency);
      return `• ${parts.join(" — ")}`;
    }).join("\n");
  }

  const verifiedMedText = medListOrNone(memory.currentMedications);
  const unverifiedMedText = medListOrNone(memory.unverifiedMedications);

  let medicationsSection = verifiedMedText;
  if (memory.currentMedications.length === 0 && memory.unverifiedMedications.length === 0) {
    medicationsSection = "None documented";
  } else if (memory.currentMedications.length === 0) {
    medicationsSection = `[Unverified]\n${unverifiedMedText}`;
  } else if (memory.unverifiedMedications.length > 0) {
    medicationsSection = `${verifiedMedText}\n[Unverified — review required]\n${unverifiedMedText}`;
  }

  const sections = [
    `PATIENT HEALTH SUMMARY`,
    `Last updated: ${date} · Based on ${memory.recordCount} uploaded record(s)`,
    ``,
    `ALLERGIES`,
    listOrNone(memory.allergies),
    ``,
    `CHRONIC CONDITIONS`,
    listOrNone(memory.chronicConditions),
    ``,
    `CURRENT MEDICATIONS`,
    medicationsSection,
    ``,
    `SURGERIES & PROCEDURES`,
    listOrNone(memory.surgeries),
    ``,
    `MEDICATION RESTRICTIONS`,
    listOrNone(memory.medicationRestrictions),
    ``,
    `CRITICAL EVENTS`,
    listOrNone(memory.criticalEvents),
  ];

  return sections.join("\n");
}

function splitMedicines(medicines: IMedicine[]): {
  verified: Array<{ name: string; dosage?: string; frequency?: string; confidence: "verified" }>;
  unverified: Array<{ name: string; dosage?: string; frequency?: string; confidence: "unverified" }>;
} {
  const verified = medicines
    .filter(m => m.name && (m.nameConfidence === "high" || m.nameConfidence === "medium"))
    .map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, confidence: "verified" as const }));

  const unverified = medicines
    .filter(m => m.name && (m.nameConfidence === "low" || m.nameConfidence === "unverified"))
    .map(m => ({ name: m.name, dosage: m.dosage, frequency: m.frequency, confidence: "unverified" as const }));

  return { verified, unverified };
}

function getSignalOnlyMeds(
  medicationsFound: string[],
  extractionMedicines: IMedicine[]
): Array<{ name: string; confidence: "unverified" }> {
  const extractedKeys = new Set(extractionMedicines.map(m => normalizeKey(m.name)));
  return medicationsFound
    .filter(name => name && name.trim().length >= 2 && !extractedKeys.has(normalizeKey(name)))
    .map(name => ({ name: name.trim(), confidence: "unverified" as const }));
}

export async function updateHealthMemory(
  userId: string,
  recordId: string,
  memorySignals: IMemorySignals,
  medicines: IMedicine[]
): Promise<void> {
  const now = new Date();
  const userOid = new mongoose.Types.ObjectId(userId);
  const recordOid = new mongoose.Types.ObjectId(recordId);

  let memory = await HealthMemory.findOne({ userId: userOid });
  if (!memory) {
    memory = new HealthMemory({ userId: userOid });
  }

  const allConditions = memorySignals.conditionsFound ?? [];
  const allCritical = memorySignals.criticalEventsFound ?? [];

  const surgeryValues = [
    ...allConditions.filter(isSurgical),
    ...allCritical.filter(isSurgical),
  ];

  const restrictionValues = allCritical.filter(isRestriction);
  const pureConditions = allConditions.filter(c => !isSurgical(c));
  const pureCritical = allCritical.filter(c => !isSurgical(c) && !isRestriction(c));

  memory.allergies = mergeMemoryItems(memory.allergies, memorySignals.allergiesFound ?? [], recordOid, now);
  memory.chronicConditions = mergeMemoryItems(memory.chronicConditions, pureConditions, recordOid, now);
  memory.surgeries = mergeMemoryItems(memory.surgeries, surgeryValues, recordOid, now);
  memory.medicationRestrictions = mergeMemoryItems(memory.medicationRestrictions, restrictionValues, recordOid, now);
  memory.criticalEvents = mergeMemoryItems(memory.criticalEvents, pureCritical, recordOid, now);

  const { verified, unverified } = splitMedicines(medicines);

  const signalOnly = getSignalOnlyMeds(memorySignals.medicationsFound ?? [], medicines);

  memory.currentMedications = mergeMedications(memory.currentMedications, verified, recordOid, now);
  memory.unverifiedMedications = mergeMedications(
    memory.unverifiedMedications,
    [...unverified, ...signalOnly],
    recordOid,
    now
  );

  memory.recordCount = (memory.recordCount ?? 0) + 1;
  memory.lastUpdatedByRecord = recordOid;
  memory.condensedProfile = buildCondensedProfile(memory);

  // Mongoose 9 does not reliably detect direct array reassignment as modified
  // on existing documents — explicitly mark every array field dirty so .save()
  // always persists all data from every record, not just the first one.
  memory.markModified("allergies");
  memory.markModified("chronicConditions");
  memory.markModified("surgeries");
  memory.markModified("medicationRestrictions");
  memory.markModified("criticalEvents");
  memory.markModified("currentMedications");
  memory.markModified("unverifiedMedications");

  await memory.save();
}

export async function rebuildHealthMemoryForUser(userId: string): Promise<{
  recordsProcessed: number;
  skipped: number;
}> {
  const userOid = new mongoose.Types.ObjectId(userId);

  await HealthMemory.deleteOne({ userId: userOid });

  const records = await HealthRecord.find(
    { userId: userOid, status: "completed" },
    { fileData: 0 }
  ).sort({ createdAt: 1 });

  let processed = 0;
  let skipped = 0;

  for (const record of records) {
    const medicines: IMedicine[] = record.extraction?.medicines ?? [];

    // Re-run extraction from stored raw text so updated patterns (e.g. allergy
    // regex fixes) are applied without needing to re-upload the file.
    let memorySignals: IMemorySignals;
    if (record.ocr?.rawText) {
      const medicationNames = medicines.map(m => m.name);
      memorySignals = extractMemorySignals(record.ocr.rawText, medicationNames);
    } else {
      memorySignals = record.memorySignals ?? {
        allergiesFound: [],
        conditionsFound: [],
        medicationsFound: [],
        criticalEventsFound: [],
      };
    }

    try {
      await updateHealthMemory(
        userId,
        record._id.toString(),
        memorySignals,
        medicines
      );
      processed++;
    } catch {
      skipped++;
    }
  }

  return { recordsProcessed: processed, skipped };
}
