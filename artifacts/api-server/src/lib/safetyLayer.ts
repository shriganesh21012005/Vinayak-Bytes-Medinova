export interface SafetyAnalysis {
  isEmergency: boolean;
  isDiagnosisRequest: boolean;
  isPrescriptionRequest: boolean;
  emergencyKeywords: string[];
}

// ─── Normalizer ───────────────────────────────────────────────────────────────
// Lowercase + collapse whitespace. We intentionally keep Unicode letters so
// Bengali/Hindi script characters are preserved for pattern matching.
function normalize(text: string): string {
  // \p{L} = Unicode letters, \p{M} = combining marks (REQUIRED for Indic scripts:
  // Bengali virama ্ U+09CD, Hindi vowel signs ी ु etc are category Mn/Mc — not \p{L}).
  // Without \p{M}, "ব্যথা" → "বযথা" and "सीने" → "सन", breaking all native-script patterns.
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ") // preserve letters + marks + digits + spaces
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Emergency patterns ───────────────────────────────────────────────────────

const EMERGENCY_PATTERNS: Array<{ pattern: RegExp; keyword: string }> = [
  // ── English ──────────────────────────────────────────────────────────────
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

  // ── Bengali (বাংলা) ───────────────────────────────────────────────────────
  { pattern: /বুকে\s*ব্যথা/u, keyword: "chest pain (bn)" },
  { pattern: /বুকে\s*ব্যাথা/u, keyword: "chest pain (bn)" },          // alternate spelling
  { pattern: /শ্বাস\s*নিতে\s*কষ্ট/u, keyword: "difficulty breathing (bn)" },
  { pattern: /শ্বাস\s*নিতে\s*পারছি\s*না/u, keyword: "difficulty breathing (bn)" },
  { pattern: /শ্বাস\s*নিচ্ছি\s*না/u, keyword: "not breathing (bn)" },
  { pattern: /মাথা\s*ঘোরা/u, keyword: "dizziness (bn)" },
  { pattern: /আত্মহত্যা/u, keyword: "suicidal thoughts (bn)" },
  { pattern: /হার্ট\s*অ্যাটাক/u, keyword: "heart attack (bn)" },
  { pattern: /স্ট্রোক/u, keyword: "stroke (bn)" },
  { pattern: /অজ্ঞান/u, keyword: "unconscious (bn)" },
  { pattern: /রক্তক্ষরণ/u, keyword: "bleeding (bn)" },
  { pattern: /খিঁচুনি/u, keyword: "seizure (bn)" },

  // ── Hindi (हिन्दी) ────────────────────────────────────────────────────────
  { pattern: /सीने\s*में\s*दर्द/u, keyword: "chest pain (hi)" },
  { pattern: /छाती\s*में\s*दर्द/u, keyword: "chest pain (hi)" },       // alternate phrasing
  { pattern: /सांस\s*लेने\s*में\s*दिक्कत/u, keyword: "difficulty breathing (hi)" },
  { pattern: /सांस\s*लेने\s*में\s*तकलीफ/u, keyword: "difficulty breathing (hi)" },
  { pattern: /सांस\s*नहीं\s*ले\s*पा/u, keyword: "not breathing (hi)" },
  { pattern: /\bचक्कर\b/u, keyword: "dizziness (hi)" },
  { pattern: /आत्महत्या/u, keyword: "suicidal thoughts (hi)" },
  { pattern: /हार्ट\s*अटैक/u, keyword: "heart attack (hi)" },
  { pattern: /दिल\s*का\s*दौरा/u, keyword: "heart attack (hi)" },
  { pattern: /स्ट्रोक/u, keyword: "stroke (hi)" },
  { pattern: /बेहोश/u, keyword: "unconscious (hi)" },
  { pattern: /गंभीर\s*रक्तस्राव/u, keyword: "severe bleeding (hi)" },
  { pattern: /\bदौरा\b/u, keyword: "seizure (hi)" },
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a single (already-normalized) text for safety issues.
 * Internal — callers should use analyzeSafety() or analyzeSafetyMultilingual().
 */
function _analyze(normalizedText: string): SafetyAnalysis {
  const emergencyMatches = EMERGENCY_PATTERNS.filter(({ pattern }) =>
    pattern.test(normalizedText)
  );

  return {
    isEmergency: emergencyMatches.length > 0,
    isDiagnosisRequest: DIAGNOSIS_PATTERNS.some(p => p.test(normalizedText)),
    isPrescriptionRequest: PRESCRIPTION_PATTERNS.some(p => p.test(normalizedText)),
    emergencyKeywords: [...new Set(emergencyMatches.map(m => m.keyword))],
  };
}

/**
 * Analyze a single message (original language OR English) for safety.
 * Normalizes before checking so punctuation/case differences don't matter.
 */
export function analyzeSafety(message: string): SafetyAnalysis {
  return _analyze(normalize(message));
}

/**
 * Analyze BOTH the raw user input (any language) AND the translated English
 * text. An emergency is triggered if EITHER check fires — this ensures native-
 * script emergency phrases are caught even before translation completes, and
 * translated English is also checked as a fallback.
 *
 * Diagnosis/prescription checks only run on the English translation since the
 * patterns are English-only.
 */
export function analyzeSafetyMultilingual(
  rawInput: string,
  englishText: string
): SafetyAnalysis {
  const rawResult = _analyze(normalize(rawInput));
  const enResult = _analyze(normalize(englishText));

  return {
    isEmergency: rawResult.isEmergency || enResult.isEmergency,
    isDiagnosisRequest: enResult.isDiagnosisRequest,
    isPrescriptionRequest: enResult.isPrescriptionRequest,
    emergencyKeywords: [
      ...new Set([...rawResult.emergencyKeywords, ...enResult.emergencyKeywords]),
    ],
  };
}
