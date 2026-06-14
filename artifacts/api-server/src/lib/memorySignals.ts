import type { IMemorySignals } from "../models/HealthRecord";

// Matches within a single line only — no newline in character class
const LINE_WORD = /[^\S\n]/; // used conceptually; patterns use [ \t] not \s

function matchAll(text: string, patterns: RegExp[]): string[] {
  const results = new Set<string>();
  for (const pat of patterns) {
    // "gim" — g: global, i: case-insensitive, m: ^ and $ match line boundaries
    const g = new RegExp(pat.source, "gim");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      const captured = m[1]?.trim()
        .replace(/[ \t]+/g, " ")
        .replace(/[,;:.]+$/, "")
        .trim();
      if (captured && captured.length > 1 && captured.length < 80) {
        results.add(captured);
      } else if (!m[1] && m[0]) {
        results.add(m[0].trim());
      }
    }
  }
  return [...results];
}

// Use [ \t] instead of \s so patterns never cross line boundaries.
// The "m" flag added in matchAll makes $ match end-of-line.
const ALLERGY_PATS = [
  /allerg(?:ic|y|ies)[ \t]+to[ \t]+([\w][\w \t,]*?)(?:\.|,|;|$)/i,
  /drug[ \t]+allergy[ \t]*[:\-][ \t]*([\w][\w \t,]*?)(?:\.|,|;|$)/i,
  /hypersensitive[ \t]+to[ \t]+([\w][\w \t,]*?)(?:\.|,|;|$)/i,
  /sensitivity[ \t]+to[ \t]+([\w][\w \t,]*?)(?:\.|,|;|$)/i,
  /(NKDA|no[ \t]+known[ \t]+drug[ \t]+allerg(?:y|ies))/i,
];

const CONDITION_PATS = [
  /diagnosis[ \t]*[:\-][ \t]*([\w][\w \t,]*?)(?:\.|;|$)/i,
  /diagnosed[ \t]+with[ \t]+([\w][\w \t]*?)(?:\.|,|;|$)/i,
  /known[ \t]+case[ \t]+of[ \t]+([\w][\w \t]*?)(?:\.|,|;|$)/i,
  /history[ \t]+of[ \t]+([\w][\w \t]*?)(?:\.|,|;|$)/i,
  /suffering[ \t]+from[ \t]+([\w][\w \t]*?)(?:\.|,|;|$)/i,
  /c\/o[ \t]+([\w][\w \t,]*?)(?:\.|;|$)/i,
  /complaints?[ \t]+of[ \t]+([\w][\w \t,]*?)(?:\.|;|$)/i,
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
      const rawStart = Math.max(0, m.index - 35);
      const rawEnd = Math.min(text.length, m.index + m[0].length + 55);
      let snippet = text.slice(rawStart, rawEnd).replace(/\s+/g, " ").trim();

      // Align to word boundaries: trim leading partial word if we sliced mid-word
      if (rawStart > 0 && snippet.length > 0 && !/\s/.test(text[rawStart - 1] ?? " ")) {
        const firstSpace = snippet.indexOf(" ");
        if (firstSpace > 0 && firstSpace <= 12) snippet = snippet.slice(firstSpace + 1);
      }
      // Trim trailing partial word
      if (rawEnd < text.length && snippet.length > 0 && !/\s/.test(text[rawEnd] ?? " ")) {
        const lastSpace = snippet.lastIndexOf(" ");
        if (lastSpace > snippet.length - 13) snippet = snippet.slice(0, lastSpace);
      }

      if (snippet) criticalEventsFound.push(snippet.trim());
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
