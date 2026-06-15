import { Router, type Response } from "express";
import mongoose from "mongoose";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { ChatConversation } from "../models/ChatConversation";
import { ChatMessage } from "../models/ChatMessage";
import { HealthMemory } from "../models/HealthMemory";
import { generateStream, type ChatHistoryMessage } from "../lib/aiProvider";
import { generateClinicalSummary } from "../lib/clinicalSummaryEngine";
import {
  detectLanguage,
  translateToEnglish,
  translateFromEnglish,
  EMERGENCY_RESPONSES,
  type SupportedLang,
} from "../lib/multilingualService";
import { analyzeSafetyMultilingual } from "../lib/safetyLayer";

const router = Router();

router.use(requireAuth);

router.post("/send", async (req: AuthRequest, res: Response) => {
  const { message } = req.body as { message?: string };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const trimmed = message.trim();
  if (trimmed.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 characters)" });
    return;
  }

  const userId = req.user!.userId;
  const userOid = new mongoose.Types.ObjectId(userId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // ── Step 1: Detect language ───────────────────────────────────────────────
    const lang: SupportedLang = detectLanguage(trimmed);
    const apiKey = process.env["OPENAI_API_KEY"];
    console.log(`[chat] LANG: ${lang} | msgLen: ${trimmed.length} | apiKey: ${apiKey ? "set" : "unset"}`);

    // ── Step 2: Safety check on RAW input FIRST (no translation required) ────
    // This runs immediately on native-script text. Bengali/Hindi emergency
    // patterns in safetyLayer.ts are matched here — no GPT call needed at all.
    const rawSafety = analyzeSafetyMultilingual(trimmed, trimmed);
    console.log(`[chat] SAFETY_RAW: emergency=${rawSafety.isEmergency} keywords=[${rawSafety.emergencyKeywords.join(", ")}]`);

    if (rawSafety.isEmergency) {
      console.log(`[chat] EMERGENCY_TRIGGERED (raw) → sending ${lang} hardcoded response`);
      const emergencyText = EMERGENCY_RESPONSES[lang];
      await _persistAndClose(userOid, trimmed, emergencyText, send);
      return;
    }

    // ── Step 3: Translate to English for AI pipeline ──────────────────────────
    let englishMessage: string;
    if (lang === "en" || !apiKey) {
      // No translation available (English user, or mock mode without API key)
      englishMessage = trimmed;
    } else {
      try {
        englishMessage = await translateToEnglish(trimmed, lang, apiKey);
        console.log(`[chat] TRANSLATED_TO_EN: "${englishMessage.slice(0, 80)}..."`);
      } catch (err) {
        console.error("[chat] translateToEnglish failed — using raw text:", err);
        englishMessage = trimmed; // use raw; safety will still run on it
      }
    }

    // ── Step 4: Safety check again on English translation ────────────────────
    // Catches cases where the English translation reveals emergency keywords
    // that the native-script pass may have missed.
    if (englishMessage !== trimmed) {
      const enSafety = analyzeSafetyMultilingual(englishMessage, englishMessage);
      console.log(`[chat] SAFETY_EN: emergency=${enSafety.isEmergency} keywords=[${enSafety.emergencyKeywords.join(", ")}]`);
      if (enSafety.isEmergency) {
        console.log(`[chat] EMERGENCY_TRIGGERED (english translation) → sending ${lang} hardcoded response`);
        const emergencyText = EMERGENCY_RESPONSES[lang];
        await _persistAndClose(userOid, trimmed, emergencyText, send);
        return;
      }
    }

    // ── Step 5: Persist user message & load context ───────────────────────────
    let conversation = await ChatConversation.findOne({ userId: userOid });
    if (!conversation) conversation = await ChatConversation.create({ userId: userOid });

    await ChatMessage.create({ conversationId: conversation._id, role: "user", content: trimmed });

    const recentDocs = await ChatMessage.find(
      { conversationId: conversation._id, role: { $in: ["user", "assistant"] } },
      { role: 1, content: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(11)
      .lean();

    const history: ChatHistoryMessage[] = recentDocs
      .reverse()
      .slice(0, -1)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const [memory, clinicalSummary] = await Promise.all([
      HealthMemory.findOne({ userId: userOid }),
      generateClinicalSummary(userId).catch(() => null),
    ]);

    // ── Step 6: Run AI pipeline (always in English internally) ───────────────
    let fullContent = "";

    for await (const chunk of generateStream(englishMessage, memory, history, clinicalSummary ?? undefined)) {
      if (chunk.type === "chunk" && chunk.content) {
        fullContent += chunk.content;
        // For English users we can stream; for non-English we buffer first
        if (lang === "en") send(chunk);
      }
    }

    if (!fullContent) {
      send({ type: "done" });
      return;
    }

    // ── Step 7: Translate response → user's language (MANDATORY for non-EN) ──
    let finalResponse: string;

    if (lang === "en" || !apiKey) {
      // English user, or no API key (mock mode) — no translation possible
      finalResponse = fullContent;
      console.log(`[chat] TRANSLATION_SKIPPED (lang=${lang}, apiKey=${apiKey ? "set" : "unset"})`);
    } else {
      try {
        finalResponse = await translateFromEnglish(fullContent, lang, apiKey);
        console.log(`[chat] FINAL_TRANSLATION_APPLIED (${lang}): "${finalResponse.slice(0, 80)}..."`);
      } catch (err) {
        // Translation failed — log loudly; still send English rather than nothing
        console.error(`[chat] translateFromEnglish FAILED for lang=${lang}:`, err);
        finalResponse = fullContent;
      }
    }

    // For non-English users, we buffered — now send the translated response
    if (lang !== "en") {
      send({ type: "chunk", content: finalResponse });
    }

    // ── Step 8: Persist assistant response ───────────────────────────────────
    await ChatMessage.create({ conversationId: conversation._id, role: "assistant", content: finalResponse });
    await ChatConversation.updateOne(
      { _id: conversation._id },
      { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } }
    );

    send({ type: "done" });

  } catch (err) {
    console.error("[chat] Unhandled error in /send:", err);
    send({ type: "error", message: "Something went wrong. Please try again." });
  } finally {
    res.end();
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _persistAndClose(
  userOid: mongoose.Types.ObjectId,
  userMessage: string,
  assistantMessage: string,
  send: (data: object) => void
): Promise<void> {
  try {
    let conversation = await ChatConversation.findOne({ userId: userOid });
    if (!conversation) conversation = await ChatConversation.create({ userId: userOid });

    // Check if user message was already persisted (emergency short-circuit)
    const lastUserMsg = await ChatMessage.findOne(
      { conversationId: conversation._id, role: "user" },
      {},
      { sort: { createdAt: -1 } }
    ).lean();

    const alreadyPersisted = lastUserMsg?.content === userMessage;
    if (!alreadyPersisted) {
      await ChatMessage.create({ conversationId: conversation._id, role: "user", content: userMessage });
    }

    await ChatMessage.create({ conversationId: conversation._id, role: "assistant", content: assistantMessage });
    await ChatConversation.updateOne(
      { _id: conversation._id },
      { $inc: { messageCount: alreadyPersisted ? 1 : 2 }, $set: { lastMessageAt: new Date() } }
    );
  } catch (err) {
    console.error("[chat] _persistAndClose DB error:", err);
  }

  send({ type: "chunk", content: assistantMessage });
  send({ type: "done" });
}

// ─── History & Clear ──────────────────────────────────────────────────────────

router.get("/history", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const userOid = new mongoose.Types.ObjectId(userId);
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);

  try {
    const conversation = await ChatConversation.findOne({ userId: userOid });
    if (!conversation) {
      res.json({ messages: [], conversationId: null });
      return;
    }

    const messages = await ChatMessage.find(
      { conversationId: conversation._id },
      { role: 1, content: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ conversationId: conversation._id, messages: messages.reverse() });
  } catch {
    res.status(500).json({ error: "Failed to load chat history" });
  }
});

router.delete("/", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const userOid = new mongoose.Types.ObjectId(userId);

  try {
    const conversation = await ChatConversation.findOne({ userId: userOid });
    if (conversation) {
      await ChatMessage.deleteMany({ conversationId: conversation._id });
      await ChatConversation.deleteOne({ _id: conversation._id });
    }
    res.json({ message: "Conversation cleared" });
  } catch {
    res.status(500).json({ error: "Failed to clear conversation" });
  }
});

export default router;
