import { createRequire } from "node:module";
import { createWorker } from "tesseract.js";

// pdf-parse is CJS-only; use createRequire so it loads correctly in ESM output
const _require = createRequire(import.meta.url);
type PdfParseResult = { text: string; numpages: number };
const pdfParse = _require("pdf-parse") as (buf: Buffer, opts?: object) => Promise<PdfParseResult>;

export interface OcrOutput {
  engine: "pdf-parse" | "tesseract" | "openai-vision";
  rawText: string;
  confidence: number;
  blocked: boolean;
  blockReason?: string;
  wordCount: number;
  processedAt: Date;
}

const CONFIDENCE_BLOCK_THRESHOLD = 0.30;
const MAX_TEXT_LENGTH = 10_000;
// If pdf-parse extracts fewer than this many words, treat the PDF as image-based
// and fall back to Tesseract OCR via pdfjs rendering.
const MIN_WORDS_TEXT_PDF = 15;

const MEDICAL_KEYWORDS = [
  "tablet", "capsule", "syrup", "injection", "ointment", "drops", "cream",
  "mg", "mcg", "ml", "iu", "units",
  "dose", "dosage", "frequency", "daily", "twice", "thrice",
  "prescription", "prescribed", "patient", "doctor", "physician",
  "diagnosis", "medicine", "medication", "drug", "treatment",
  "morning", "evening", "night", "bedtime", "meals",
  "allergy", "allergic", "condition", "symptoms", "tab", "cap",
];

function scoreConfidence(text: string): { confidence: number; wordCount: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount < 4) return { confidence: 0.05, wordCount };

  let score = 0;

  if (wordCount >= 4)  score += 0.15;
  if (wordCount >= 15) score += 0.15;
  if (wordCount >= 35) score += 0.10;
  if (wordCount >= 70) score += 0.05;

  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of MEDICAL_KEYWORDS) {
    if (lower.includes(kw)) hits++;
  }
  if (hits >= 1) score += 0.15;
  if (hits >= 3) score += 0.10;
  if (hits >= 7) score += 0.05;

  if (/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?)/i.test(text)) score += 0.10;

  if (/(patient|doctor|dr\.|rx|patient name|date of birth|dob)/i.test(text)) score += 0.10;

  return { confidence: Math.min(score, 1.0), wordCount };
}

/**
 * Render an image-based PDF to PNG buffers (one per page, up to maxPages)
 * using pdfjs-dist + @napi-rs/canvas, then run Tesseract on each page.
 */
async function extractTextFromImagePDF(buffer: Buffer): Promise<OcrOutput | null> {
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const pdfData = new Uint8Array(buffer);
    const loadingTask = (pdfjsLib as unknown as { getDocument: (opts: object) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> } })
      .getDocument({ data: pdfData, useSystemFonts: true });
    const pdfDoc = await loadingTask.promise;

    const maxPages = Math.min(pdfDoc.numPages, 4);
    let combinedText = "";
    let totalBlended = 0;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum) as {
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> };
      };

      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const context = canvas.getContext("2d");

      await page.render({ canvasContext: context, viewport }).promise;

      const imageBuffer = canvas.toBuffer("image/png");
      const pageOcr = await extractTextFromImage(imageBuffer);

      combinedText += (pageOcr.rawText ?? "") + "\n";
      totalBlended += pageOcr.confidence;
    }

    const rawText = combinedText.slice(0, MAX_TEXT_LENGTH);
    const avgConfidence = parseFloat((totalBlended / maxPages).toFixed(3));
    const { wordCount } = scoreConfidence(rawText);
    const blocked = avgConfidence < CONFIDENCE_BLOCK_THRESHOLD;

    return {
      engine: "tesseract",
      rawText,
      confidence: avgConfidence,
      blocked,
      blockReason: blocked
        ? `Scanned PDF quality too low for safe extraction (confidence ${(avgConfidence * 100).toFixed(0)}%). ` +
          `Please upload a clearer, higher-resolution scan as a JPG or PNG.`
        : undefined,
      wordCount,
      processedAt: new Date(),
    };
  } catch {
    return null;
  }
}

export async function extractTextFromPDF(buffer: Buffer): Promise<OcrOutput> {
  try {
    const data = await pdfParse(buffer);
    const rawText = (data.text ?? "").slice(0, MAX_TEXT_LENGTH);
    const { confidence, wordCount } = scoreConfidence(rawText);

    // If very few words extracted, the PDF is likely image-based — try Tesseract fallback
    if (wordCount < MIN_WORDS_TEXT_PDF) {
      const imageResult = await extractTextFromImagePDF(buffer);
      if (imageResult) return imageResult;
    }

    const blocked = confidence < CONFIDENCE_BLOCK_THRESHOLD;

    return {
      engine: "pdf-parse",
      rawText,
      confidence,
      blocked,
      blockReason: blocked
        ? `Document quality too low for safe extraction (confidence ${(confidence * 100).toFixed(0)}%). ` +
          `The PDF may be image-based or contain no readable text. ` +
          `Please upload a clear image scan (JPG or PNG) instead.`
        : undefined,
      wordCount,
      processedAt: new Date(),
    };
  } catch {
    return {
      engine: "pdf-parse",
      rawText: "",
      confidence: 0,
      blocked: true,
      blockReason: "Failed to parse PDF. The file may be corrupted, encrypted, or password-protected.",
      wordCount: 0,
      processedAt: new Date(),
    };
  }
}

export async function extractTextFromImage(buffer: Buffer): Promise<OcrOutput> {
  let worker;
  try {
    worker = await createWorker("eng", 1, {
      logger: () => {},
      errorHandler: () => {},
    });

    const { data } = await worker.recognize(buffer);
    const rawText = (data.text ?? "").slice(0, MAX_TEXT_LENGTH);
    const tesseractRaw = (data.confidence ?? 0) / 100;
    const { confidence: heuristic, wordCount } = scoreConfidence(rawText);

    const blended = tesseractRaw * 0.5 + heuristic * 0.5;
    const blocked = blended < CONFIDENCE_BLOCK_THRESHOLD;

    return {
      engine: "tesseract",
      rawText,
      confidence: parseFloat(blended.toFixed(3)),
      blocked,
      blockReason: blocked
        ? `Image quality too low for safe extraction (confidence ${(blended * 100).toFixed(0)}%). ` +
          `Please upload a clearer, higher-resolution scan. ` +
          `Ensure good lighting and that the text is fully visible.`
        : undefined,
      wordCount,
      processedAt: new Date(),
    };
  } catch {
    return {
      engine: "tesseract",
      rawText: "",
      confidence: 0,
      blocked: true,
      blockReason: "Failed to process image. Please ensure the file is a valid JPEG or PNG.",
      wordCount: 0,
      processedAt: new Date(),
    };
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore */ }
    }
  }
}

export async function processFile(buffer: Buffer, mimeType: string): Promise<OcrOutput> {
  if (mimeType === "application/pdf") {
    return extractTextFromPDF(buffer);
  }
  if (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png"
  ) {
    return extractTextFromImage(buffer);
  }
  return {
    engine: "tesseract",
    rawText: "",
    confidence: 0,
    blocked: true,
    blockReason: "Unsupported file type. Please upload a PDF, JPEG, or PNG file.",
    wordCount: 0,
    processedAt: new Date(),
  };
}
