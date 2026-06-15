import type { IClinicalSummary } from "../models/ClinicalSummaryCache";

export interface SanitizedClinicalData {
  majorAllergies: string[];
  chronicConditions: string[];
  medicalEvents: string[];
  medications: Array<{ name: string; dosage?: string; frequency?: string; confidence: string }>;
  importantRestrictions: string[];
}

const DISALLOWED_KEYS = new Set([
  "riskLevel",
  "diagnosis",
  "suggestedDisease",
  "interpretation",
  "prognosis",
  "prediction",
  "likelihood",
  "assessment",
  "inference",
]);

export function sanitizeClinicalContext(summary: IClinicalSummary): SanitizedClinicalData {
  const sanitized: SanitizedClinicalData = {
    majorAllergies: summary.majorAllergies ?? [],
    chronicConditions: summary.chronicConditions ?? [],
    medicalEvents: summary.medicalEvents ?? [],
    medications: (summary.medications ?? []).map(m => ({
      name: m.name,
      ...(m.dosage ? { dosage: m.dosage } : {}),
      ...(m.frequency ? { frequency: m.frequency } : {}),
      confidence: m.confidence,
    })),
    importantRestrictions: summary.importantRestrictions ?? [],
  };

  // Strip any extra keys that could imply AI reasoning
  for (const key of DISALLOWED_KEYS) {
    if (key in (summary as Record<string, unknown>)) {
      delete (sanitized as Record<string, unknown>)[key];
    }
  }

  return sanitized;
}
