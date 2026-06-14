import { Router, type Response } from "express";
import mongoose from "mongoose";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { ChatConversation } from "../models/ChatConversation";
import { ChatMessage } from "../models/ChatMessage";
import { HealthMemory } from "../models/HealthMemory";
import { generateMockStream } from "../lib/mockAiGenerator";

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
    let conversation = await ChatConversation.findOne({ userId: userOid });
    if (!conversation) {
      conversation = await ChatConversation.create({ userId: userOid });
    }

    await ChatMessage.create({
      conversationId: conversation._id,
      role: "user",
      content: trimmed,
    });

    const memory = await HealthMemory.findOne({ userId: userOid });

    let fullContent = "";

    for await (const chunk of generateMockStream(trimmed, memory)) {
      if (chunk.type === "chunk" && chunk.content) {
        fullContent += chunk.content;
        send(chunk);
      } else if (chunk.type === "done") {
        await ChatMessage.create({
          conversationId: conversation._id,
          role: "assistant",
          content: fullContent,
        });

        await ChatConversation.updateOne(
          { _id: conversation._id },
          {
            $inc: { messageCount: 2 },
            $set: { lastMessageAt: new Date() },
          }
        );

        send({ type: "done" });
      }
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
