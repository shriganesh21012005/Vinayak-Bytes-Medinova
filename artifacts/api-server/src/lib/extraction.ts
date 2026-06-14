import type { IMedicine, IExtraction } from "../models/HealthRecord";

const DOSAGE_RE = /\b(\d+(?:\.\d+)?)\s*(mg|mcg|g(?!\w)|ml|iu|units?)\b/gi;

const FREQUENCY_MAP: Array<{ re: RegExp; label: string }> = [
  { re: /\b(?:once(?:\s+a)?\s+daily|od)\b/i,           label: "Once daily" },
  { re: /\b(?:twice(?:\s+a)?\s+daily|bd|bid)\b/i,      label: "Twice daily" },
  { re: /\b(?:tds?|tid|three\s+times?\s+(?:a\s+)?day)\b/i, label: "Three times daily" },
  { re: /\b(?:qid|qds?|four\s+times?\s+(?:a\s+)?day)\b/i,  label: "Four times daily" },
  { re: /\bevery\s+(\d+)\s+hours?\b/i,                  label: "Every $1 hours" },
  { re: /\b(\d+)\s+times?\s+(?:a\s+)?day\b/i,          label: "$1 times daily" },
  { re: /\b(?:hs|qhs|at\s+bedtime|bedtime)\b/i,        label: "At bedtime" },
  { re: /\b(?:sos|prn|as\s+needed|when\s+required)\b/i, label: "As needed" },
  { re: /\bweekly\b/i,                                  label: "Weekly" },
  { re: /\bmonthly\b/i,                                 label: "Monthly" },
];

const DURATION_RE = /\b(?:for\s+)?(\d+)\s+(days?|weeks?|months?)\b/i;

const PHARMA_SUFFIXES = [
  "cillin", "mycin", "floxacin", "oxacin", "zole", "prazole",
  "sartan", "pril", "statin", "olol", "dipine", "vir", "navir",
  "cycline", "sulfate", "chloride", "sodium", "potassium",
  "hydrochloride", "acetate", "oxide", "amine", "mab", "tinib",
];

const STOP_WORDS = new Set([
  "tablet", "tablets", "capsule", "capsules", "syrup", "injection",
  "ointment", "cream", "drops", "take", "patient", "doctor", "name",
  "date", "age", "rx", "prescription", "prescribed", "dispense",
  "sig", "refill", "morning", "evening", "night", "before", "after",
  "with", "without", "food", "meals", "water", "and", "the", "for",
  "use", "as", "directed", "tab", "cap", "inj", "inf", "soln",
]);

function extractDosage(line: string): string | undefined {
  DOSAGE_RE.lastIndex = 0;
  const m = DOSAGE_RE.exec(line);
  DOSAGE_RE.lastIndex = 0;
  return m ? `${m[1]} ${m[2].toLowerCase()}` : undefined;
}

function extractFrequency(text: string): string | undefined {
  for (const { re, label } of FREQUENCY_MAP) {
    const m = text.match(re);
    if (m) return label.replace(/\$(\d+)/g, (_, n) => m[parseInt(n)] ?? "");
  }
  return undefined;
}

function extractDuration(text: string): string | undefined {
  const m = DURATION_RE.exec(text);
  return m ? `${m[1]} ${m[2].toLowerCase()}` : undefined;
}

function nameConfidence(name: string): IMedicine["nameConfidence"] {
  if (!name || name.length < 2) return "unverified";
  const lower = name.toLowerCase().trim();
  if (STOP_WORDS.has(lower)) return "unverified";
  if (lower.length <= 2) return "unverified";
  if (/\d/.test(name)) return "low";
  if (PHARMA_SUFFIXES.some(s => lower.endsWith(s))) return "high";
  if (/^[A-Z][a-z]{3,}$/.test(name.trim())) return "medium";
  return "low";
}

function parseName(rawBefore: string): string {
  return rawBefore
    .replace(/^\d+[\.\)\-]\s*/, "")
    .replace(/[:\-\|\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(-2)
    .join(" ")
    .trim();
}

export function extractPrescriptionData(text: string): IExtraction {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const medicines: IMedicine[] = [];
  const rawLines: string[] = [];

  for (const line of lines) {
    DOSAGE_RE.lastIndex = 0;
    const hasDosage = DOSAGE_RE.test(line);
    DOSAGE_RE.lastIndex = 0;
    if (!hasDosage) continue;

    rawLines.push(line);
    const dosage = extractDosage(line);

    const idx = line.search(/\d+(?:\.\d+)?\s*(?:mg|mcg|g(?!\w)|ml|iu|units?)/i);
    const before = idx > 0 ? line.slice(0, idx) : "";
    const name = parseName(before);
    if (!name) continue;

    const conf = nameConfidence(name.split(" ").pop() ?? name);

    medicines.push({
      name: conf === "unverified" ? name : name,
      nameConfidence: conf,
      dosage,
      frequency: extractFrequency(line),
      duration: extractDuration(line),
    });
  }

  const warnings: string[] = [];

  if (medicines.length === 0) {
    warnings.push(
      "No medicines with clear dosage information could be extracted from this document. " +
      "Please ensure the prescription contains standard dosage notation (e.g. 500mg, 10ml)."
    );
  }

  const unverifiedCount = medicines.filter(m => m.nameConfidence === "unverified").length;
  if (unverifiedCount > 0) {
    warnings.push(
      `${unverifiedCount} medicine name(s) are marked "unverified" — ` +
      "the name could not be identified with confidence. " +
      "Do not administer based on this reading alone."
    );
  }

  if (medicines.some(m => m.nameConfidence === "low")) {
    warnings.push(
      "Some medicine names have low confidence. Please verify against the original document."
    );
  }

  warnings.push(
    "This extraction is rule-based and for informational reference only. " +
    "Always consult your healthcare provider before taking any medication."
  );

  return {
    source: "rule-based",
    medicines,
    warnings,
    rawMedicineText: rawLines.join("\n"),
    extractedAt: new Date(),
  };
}
