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
    console.log(`[PIPELINE START] userId=${userId} msgLen=${trimmed.length}`);

    // ── 1. Detect language ────────────────────────────────────────────────────
    const lang: SupportedLang = detectLanguage(trimmed);
    const apiKey = process.env["OPENAI_API_KEY"];
    console.log(`[LANG DETECTED] lang=${lang} apiKey=${apiKey ? "set" : "unset"}`);

    // ── 2. Safety check on RAW input — HARD STOP, no GPT, no translation ─────
    // This fires immediately on native Bengali/Hindi script before any API call.
    const rawSafety = analyzeSafetyMultilingual(trimmed, trimmed);
    console.log(`[SAFETY RESULT] emergency=${rawSafety.isEmergency} keywords=[${rawSafety.emergencyKeywords.join(", ")}]`);

    if (rawSafety.isEmergency) {
      console.log(`[SAFETY RESULT] EMERGENCY → returning hardcoded ${lang} response, GPT bypassed`);
      const emergencyText = EMERGENCY_RESPONSES[lang];

      // Persist both turns then close
      let conv = await ChatConversation.findOne({ userId: userOid });
      if (!conv) conv = await ChatConversation.create({ userId: userOid });
      await ChatMessage.create({ conversationId: conv._id, role: "user", content: trimmed });
      await ChatMessage.create({ conversationId: conv._id, role: "assistant", content: emergencyText });
      await ChatConversation.updateOne(
        { _id: conv._id },
        { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } }
      );

      send({ type: "chunk", content: emergencyText });
      send({ type: "done" });
      console.log(`[PIPELINE END] emergency path`);
      return;
    }

    // ── 3. Translate input → English for AI pipeline ─────────────────────────
    let englishMessage: string = trimmed;
    if (lang !== "en" && apiKey) {
      try {
        englishMessage = await translateToEnglish(trimmed, lang, apiKey);
        console.log(`[LANG DETECTED] translated to EN: "${englishMessage.slice(0, 100)}"`);
      } catch (err) {
        console.error("[LANG DETECTED] translateToEnglish failed, using raw text:", err);
        englishMessage = trimmed;
      }
    }

    // ── 4. Safety check on English translation (second pass) ─────────────────
    if (englishMessage !== trimmed) {
      const enSafety = analyzeSafetyMultilingual(englishMessage, englishMessage);
      console.log(`[SAFETY RESULT] EN-pass emergency=${enSafety.isEmergency} keywords=[${enSafety.emergencyKeywords.join(", ")}]`);

      if (enSafety.isEmergency) {
        console.log(`[SAFETY RESULT] EMERGENCY (EN translation) → returning hardcoded ${lang} response`);
        const emergencyText = EMERGENCY_RESPONSES[lang];

        let conv = await ChatConversation.findOne({ userId: userOid });
        if (!conv) conv = await ChatConversation.create({ userId: userOid });
        await ChatMessage.create({ conversationId: conv._id, role: "user", content: trimmed });
        await ChatMessage.create({ conversationId: conv._id, role: "assistant", content: emergencyText });
        await ChatConversation.updateOne(
          { _id: conv._id },
          { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } }
        );

        send({ type: "chunk", content: emergencyText });
        send({ type: "done" });
        console.log(`[PIPELINE END] emergency path (EN)`);
        return;
      }
    }

    // ── 5. Persist user message & load context ────────────────────────────────
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

    const memCount = memory?.recordCount ?? 0;
    const memFields = memory
      ? [
          `meds=${memory.currentMedications.length}`,
          `allergies=${memory.allergies.length}`,
          `conditions=${memory.chronicConditions.length}`,
          `criticalEvents=${memory.criticalEvents.length}`,
        ].join(" ")
      : "none";
    console.log(`[MEMORY LOADED COUNT] recordCount=${memCount} ${memFields} clinicalSummary=${clinicalSummary ? "yes" : "no"}`);

    // ── 6. GPT call (always with English message) ─────────────────────────────
    console.log(`[GPT CALLED] provider=${process.env["AI_PROVIDER"] ?? "mock"} englishMsg="${englishMessage.slice(0, 80)}"`);
    let fullContent = "";

    for await (const chunk of generateStream(englishMessage, memory, history, clinicalSummary ?? undefined)) {
      if (chunk.type === "chunk" && chunk.content) {
        fullContent += chunk.content;
        if (lang === "en") send(chunk); // stream directly for English users
      }
    }

    if (!fullContent) {
      send({ type: "done" });
      console.log(`[PIPELINE END] empty GPT response`);
      return;
    }

    // ── 7. Translate response → user's language (MANDATORY for non-English) ───
    let finalResponse = fullContent;

    if (lang !== "en" && apiKey) {
      try {
        finalResponse = await translateFromEnglish(fullContent, lang, apiKey);
        console.log(`[PIPELINE END] FINAL_TRANSLATION_APPLIED lang=${lang} len=${finalResponse.length}`);
      } catch (err) {
        console.error(`[PIPELINE END] translateFromEnglish FAILED lang=${lang}:`, err);
        finalResponse = fullContent; // last-resort English fallback
      }
    } else {
      console.log(`[PIPELINE END] translation skipped (lang=${lang} apiKey=${apiKey ? "set" : "unset"})`);
    }

    // Send translated chunk for non-English (buffered above); English was streamed already
    if (lang !== "en") {
      send({ type: "chunk", content: finalResponse });
    }

    // ── 8. Persist assistant response ─────────────────────────────────────────
    await ChatMessage.create({ conversationId: conversation._id, role: "assistant", content: finalResponse });
    await ChatConversation.updateOne(
      { _id: conversation._id },
      { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } }
    );

    send({ type: "done" });
    console.log(`[PIPELINE END] success lang=${lang} responseLen=${finalResponse.length}`);

  } catch (err) {
    console.error("[PIPELINE END] unhandled error:", err);
    send({ type: "error", message: "Something went wrong. Please try again." });
  } finally {
    res.end();
  }
});

// ─── History ──────────────────────────────────────────────────────────────────

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

// ─── Clear ────────────────────────────────────────────────────────────────────

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
