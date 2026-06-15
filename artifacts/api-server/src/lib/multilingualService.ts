/**
 * Multilingual layer for the AI Health Assistant.
 * Supports English (en), Hindi (hi), Bengali (bn).
 *
 * Flow:
 *   detect(input) → translateToEnglish → AI pipeline → translateFromEnglish
 *
 * Translation uses GPT-4o-mini when available; falls back to pass-through
 * (English-only) when not.
 *
 * Emergency responses are NEVER translated via GPT — hardcoded strings only.
 */

export type SupportedLang = "en" | "hi" | "bn";

// ─── Hardcoded emergency strings (never softened by translation) ─────────────

export const EMERGENCY_RESPONSES: Record<SupportedLang, string> = {
  en: "🚨 This sounds like a medical emergency. **Call emergency services immediately (102 / 112)** or go to the nearest emergency room right now. Do not wait.",
  hi: "🚨 यह एक चिकित्सा आपात स्थिति लग रही है। **अभी तुरंत आपातकालीन सेवाओं को कॉल करें (102 / 112)** या नजदीकी अस्पताल के आपातकालीन कक्ष में जाएं। देरी न करें।",
  bn: "🚨 এটি একটি চিকিৎসা জরুরি অবস্থা মনে হচ্ছে। **এখনই জরুরি সেবায় কল করুন (102 / 112)** অথবা নিকটতম হাসপাতালের জরুরি বিভাগে যান। দেরি করবেন না।",
};

const LANG_NAMES: Record<SupportedLang, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
};

// ─── Language detection ───────────────────────────────────────────────────────

// Devanagari block: U+0900–U+097F (Hindi uses this for most characters)
const DEVANAGARI_RE = /[\u0900-\u097F]/;
// Bengali/Bangla block: U+0980–U+09FF
const BENGALI_RE = /[\u0980-\u09FF]/;

export function detectLanguage(text: string): SupportedLang {
  const sample = text.slice(0, 500); // check first 500 chars — fast

  // Count script characters to avoid false positives from a single diacritic
  const devanagariCount = (sample.match(/[\u0900-\u097F]/g) ?? []).length;
  const bengaliCount = (sample.match(/[\u0980-\u09FF]/g) ?? []).length;

  if (devanagariCount >= 2) return "hi";
  if (bengaliCount >= 2) return "bn";
  return "en";
}

// ─── In-memory translation cache ─────────────────────────────────────────────
// Key: `${lang}:${text}`, capped at 256 entries (FIFO eviction)

const MAX_CACHE = 256;
const translationCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  return translationCache.get(key);
}

function cacheSet(key: string, value: string): void {
  if (translationCache.size >= MAX_CACHE) {
    // Evict the oldest entry
    const firstKey = translationCache.keys().next().value;
    if (firstKey !== undefined) translationCache.delete(firstKey);
  }
  translationCache.set(key, value);
}

// ─── GPT translation ──────────────────────────────────────────────────────────

async function gptTranslate(text: string, prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI translation error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content?.trim() ?? text;
}

// ─── Public translation functions ────────────────────────────────────────────

/**
 * Translate user input (any supported language) → English.
 * Returns the original text unchanged if already English or no API key.
 */
export async function translateToEnglish(
  text: string,
  lang: SupportedLang,
  apiKey: string | undefined
): Promise<string> {
  if (lang === "en" || !apiKey) return text;

  const cacheKey = `toEn:${lang}:${text}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const prompt =
    "You are a medical translation engine. Translate the following text to English exactly. " +
    "Preserve medical meaning precisely. Do not add, remove, or interpret — only translate. " +
    "Return only the translated text with no explanation.";

  const translated = await gptTranslate(text, prompt, apiKey);
  cacheSet(cacheKey, translated);
  return translated;
}

/**
 * Translate AI response (English) → target language.
 * Returns the original text unchanged if target is English or no API key.
 */
export async function translateFromEnglish(
  text: string,
  lang: SupportedLang,
  apiKey: string | undefined
): Promise<string> {
  if (lang === "en" || !apiKey) return text;

  const cacheKey = `fromEn:${lang}:${text}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const langName = LANG_NAMES[lang];
  const prompt =
    `You are a medical translation engine. Translate the following text to ${langName}. ` +
    "Keep all medical information accurate and safe. " +
    "Preserve emergency warnings exactly — do NOT soften, omit, or weaken them. " +
    "Do not add new medical meaning. Return only the translated text with no explanation.";

  const translated = await gptTranslate(text, prompt, apiKey);
  cacheSet(cacheKey, translated);
  return translated;
}
