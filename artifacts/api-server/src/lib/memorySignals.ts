import type { IMemorySignals } from "../models/HealthRecord";

function matchAll(text: string, patterns: RegExp[]): string[] {
  const results = new Set<string>();
  for (const pat of patterns) {
    const g = new RegExp(pat.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const captured = m[1]?.trim()
        .replace(/\s+/g, " ")
        .replace(/[,;:.]+$/, "")
        .trim();
      if (captured && captured.length > 1 && captured.length < 100) {
        results.add(captured);
      } else if (!m[1] && m[0]) {
        results.add(m[0].trim());
      }
    }
  }
  return [...results];
}

const ALLERGY_PATS = [
  /allerg(?:ic|y|ies)\s+to\s+([\w\s,]+?)(?:\.|,|;|$)/i,
  /drug\s+allergy\s*[:\-]\s*([\w\s,]+?)(?:\.|,|;|$)/i,
  /hypersensitive\s+to\s+([\w\s,]+?)(?:\.|,|;|$)/i,
  /sensitivity\s+to\s+([\w\s,]+?)(?:\.|,|;|$)/i,
  /(NKDA|no\s+known\s+drug\s+allerg(?:y|ies))/i,
];

const CONDITION_PATS = [
  /diagnosis\s*[:\-]\s*([\w\s,]+?)(?:\.|;|$)/i,
  /diagnosed\s+with\s+([\w\s]+?)(?:\.|,|;|$)/i,
  /known\s+case\s+of\s+([\w\s]+?)(?:\.|,|;|$)/i,
  /history\s+of\s+([\w\s]+?)(?:\.|,|;|$)/i,
  /suffering\s+from\s+([\w\s]+?)(?:\.|,|;|$)/i,
  /c\/o\s+([\w\s,]+?)(?:\.|;|$)/i,
  /complaints?\s+of\s+([\w\s,]+?)(?:\.|;|$)/i,
];

const CRITICAL_PATS = [
  /anaphylaxis/i,
  /severe\s+(?:allergic\s+)?reaction/i,
  /contraindicated/i,
  /life[- ]threatening/i,
  /critically\s+ill/i,
  /do\s+not\s+use\s+(?:with|if)/i,
  /high\s+risk/i,
];

export function extractMemorySignals(
  text: string,
  medicationNames: string[]
): IMemorySignals {
  const allergiesFound = matchAll(text, ALLERGY_PATS);

  const conditionsFound = matchAll(text, CONDITION_PATS).filter(
    c => c.split(/\s+/).length <= 10
  );

  const criticalEventsFound: string[] = [];
  for (const pat of CRITICAL_PATS) {
    const g = new RegExp(pat.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const start = Math.max(0, m.index - 25);
      const end = Math.min(text.length, m.index + m[0].length + 40);
      const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
      criticalEventsFound.push(snippet);
    }
  }

  const medicationsFound = [
    ...new Set(medicationNames.filter(n => n && n.length > 1)),
  ];

  return {
    allergiesFound: [...new Set(allergiesFound)],
    conditionsFound: [...new Set(conditionsFound)],
    medicationsFound,
    criticalEventsFound: [...new Set(criticalEventsFound)],
  };
}
