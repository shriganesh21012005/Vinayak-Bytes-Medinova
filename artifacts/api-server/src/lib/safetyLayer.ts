export interface SafetyAnalysis {
  isEmergency: boolean;
  isDiagnosisRequest: boolean;
  isPrescriptionRequest: boolean;
  emergencyKeywords: string[];
}

const EMERGENCY_PATTERNS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /chest\s*pain/i, keyword: "chest pain" },
  { pattern: /heart\s*attack/i, keyword: "heart attack" },
  { pattern: /can'?t?\s*breathe/i, keyword: "difficulty breathing" },
  { pattern: /difficulty\s*breath/i, keyword: "difficulty breathing" },
  { pattern: /\bstroke\b/i, keyword: "stroke" },
  { pattern: /unconscious/i, keyword: "unconsciousness" },
  { pattern: /severe\s*bleed/i, keyword: "severe bleeding" },
  { pattern: /\boverdose\b/i, keyword: "overdose" },
  { pattern: /\bsuicid/i, keyword: "suicidal thoughts" },
  { pattern: /not\s*breathing/i, keyword: "not breathing" },
  { pattern: /\bchoking\b/i, keyword: "choking" },
  { pattern: /anaphylax/i, keyword: "anaphylaxis" },
  { pattern: /severe\s*allergic\s*react/i, keyword: "severe allergic reaction" },
  { pattern: /call\s*911/i, keyword: "emergency" },
  { pattern: /face\s*drooping/i, keyword: "stroke symptoms" },
  { pattern: /arm\s*weakness/i, keyword: "stroke symptoms" },
  { pattern: /sudden\s*numbness/i, keyword: "stroke symptoms" },
  { pattern: /loss\s*of\s*consciousness/i, keyword: "loss of consciousness" },
  { pattern: /\bseizure\b/i, keyword: "seizure" },
  { pattern: /coughing\s*blood/i, keyword: "coughing blood" },
];

const DIAGNOSIS_PATTERNS: RegExp[] = [
  /do\s+i\s+have\s+(a\s+)?(disease|condition|cancer|diabetes|disorder|syndrome|infection)/i,
  /is\s+this\s+(cancer|diabetes|disease|a\s+condition|serious)/i,
  /diagnose\s+me/i,
  /what\s+(disease|condition|illness)\s+do\s+i\s+have/i,
  /am\s+i\s+(sick|ill|dying)/i,
  /what('?s|\s+is)\s+(wrong|the\s+matter)\s+with\s+me/i,
  /tell\s+me\s+what\s+i\s+have/i,
];

const PRESCRIPTION_PATTERNS: RegExp[] = [
  /prescribe\s+(me|a|some)/i,
  /what\s+medicine\s+should\s+i\s+take/i,
  /what\s+(drug|medication|pill)\s+should\s+i\s+(take|use)/i,
  /give\s+me\s+a\s+prescription/i,
  /write\s+(me\s+)?a\s+prescription/i,
  /recommend\s+(a\s+)?(drug|medication|medicine)\s+for\s+me/i,
  /which\s+(drug|medicine|medication)\s+(is\s+best|should\s+i)/i,
];

export function analyzeSafety(message: string): SafetyAnalysis {
  const emergencyMatches = EMERGENCY_PATTERNS.filter(({ pattern }) => pattern.test(message));

  return {
    isEmergency: emergencyMatches.length > 0,
    isDiagnosisRequest: DIAGNOSIS_PATTERNS.some(p => p.test(message)),
    isPrescriptionRequest: PRESCRIPTION_PATTERNS.some(p => p.test(message)),
    emergencyKeywords: [...new Set(emergencyMatches.map(m => m.keyword))],
  };
}
