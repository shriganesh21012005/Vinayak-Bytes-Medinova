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

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── Step 1: Detect language ──────────────────────────────────────────────
    const lang: SupportedLang = detectLanguage(trimmed);
    const apiKey = process.env["OPENAI_API_KEY"];

    // ── Step 2: Translate user message → English ─────────────────────────────
    // We only call GPT for translation when AI_PROVIDER=openai (apiKey present)
    const englishMessage =
      lang === "en"
        ? trimmed
        : await translateToEnglish(trimmed, lang, apiKey).catch(() => trimmed);

    // ── Step 3: Persist the original (untranslated) user message ─────────────
    let conversation = await ChatConversation.findOne({ userId: userOid });
    if (!conversation) {
      conversation = await ChatConversation.create({ userId: userOid });
    }

    await ChatMessage.create({
      conversationId: conversation._id,
      role: "user",
      content: trimmed,
    });

    // ── Step 4: Emergency check on BOTH raw input and English translation ────
    // Raw input catches native-script patterns (Bengali/Hindi) immediately,
    // even before translation. English translation catches any patterns the
    // native pass may have missed. Either hit triggers the emergency bypass.
    const safety = analyzeSafetyMultilingual(trimmed, englishMessage);

    if (safety.isEmergency) {
      const emergencyText = EMERGENCY_RESPONSES[lang];

      // Persist the hardcoded emergency assistant response
      await ChatMessage.create({
        conversationId: conversation._id,
        role: "assistant",
        content: emergencyText,
      });

      await ChatConversation.updateOne(
        { _id: conversation._id },
        { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } }
      );

      send({ type: "chunk", content: emergencyText });
      send({ type: "done" });
      return;
    }

    // ── Step 5: Load context (conversation history + health memory) ──────────
    const recentDocs = await ChatMessage.find(
      {
        conversationId: conversation._id,
        role: { $in: ["user", "assistant"] },
      },
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

    // ── Step 6: Run AI pipeline (always in English) ──────────────────────────
    let fullContent = "";

    if (lang === "en") {
      // Native English — stream chunks directly for lowest latency
      for await (const chunk of generateStream(
        englishMessage,
        memory,
        history,
        clinicalSummary ?? undefined
      )) {
        if (chunk.type === "chunk" && chunk.content) {
          fullContent += chunk.content;
          send(chunk);
        } else if (chunk.type === "done") {
          if (fullContent) {
            await ChatMessage.create({
              conversationId: conversation._id,
              role: "assistant",
              content: fullContent,
            });
            await ChatConversation.updateOne(
              { _id: conversation._id },
              { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } }
            );
          }
          send({ type: "done" });
        }
      }
    } else {
      // Non-English — buffer full response, then translate, then send as one chunk
      for await (const chunk of generateStream(
        englishMessage,
        memory,
        history,
        clinicalSummary ?? undefined
      )) {
        if (chunk.type === "chunk" && chunk.content) {
          fullContent += chunk.content;
        }
      }

      if (fullContent) {
        // ── Step 7: Translate response → user's language ──────────────────────
        const translatedResponse = await translateFromEnglish(
          fullContent,
          lang,
          apiKey
        ).catch(() => fullContent); // fallback: send English on translation error

        await ChatMessage.create({
          conversationId: conversation._id,
          role: "assistant",
          content: translatedResponse,
        });

        await ChatConversation.updateOne(
          { _id: conversation._id },
          { $inc: { messageCount: 2 }, $set: { lastMessageAt: new Date() } }
        );

        send({ type: "chunk", content: translatedResponse });
      }

      send({ type: "done" });
    }
  } catch (err) {
    send({ type: "error", message: "Something went wrong. Please try again." });
  } finally {
    res.end();
  }
});

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

    res.json({
      conversationId: conversation._id,
      messages: messages.reverse(),
    });
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
