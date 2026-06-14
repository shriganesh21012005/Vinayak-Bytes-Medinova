import OpenAI from "openai";
import { analyzeSafety } from "./safetyLayer";
import { buildSystemPrompt } from "./healthContextBuilder";
import type { IHealthMemory } from "../models/HealthMemory";
import type { StreamChunk } from "./mockAiGenerator";

export type { StreamChunk };

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

const EMERGENCY_RESPONSE = (keywords: string[]) =>
  `🚨 EMERGENCY — Please call emergency services (911 or your local emergency number) IMMEDIATELY.

You mentioned: ${keywords.join(", ")}. This requires immediate medical attention that I cannot provide.

Please act now:
• Call 911 (or your local emergency number)
• Stay on the line with the dispatcher
• Do not drive yourself if symptoms are severe

Do not wait. Emergency services can help you right now.`;

const DIAGNOSIS_RESPONSE = `I understand you're looking for answers — that's completely natural when something feels off.

However, diagnosing medical conditions is something only a trained physician can do safely. It requires a physical examination, your full medical history, and often lab tests or imaging that I simply don't have access to.

What I can do to help:
• Give you general information about health topics
• Help you prepare questions for your doctor appointment
• Help you understand medical terms or concepts

Would you like help preparing for a conversation with your healthcare provider?`;

const PRESCRIPTION_RESPONSE = `Recommending or prescribing specific medications is something only a licensed physician or pharmacist can do safely — it's not within my role as a health information assistant.

Please speak with your doctor or pharmacist, who can safely review your full health picture and prescribe what's right for you.`;

async function* streamText(text: string): AsyncGenerator<StreamChunk> {
  const tokens = text.split(/(\s+)/);
  const CHUNK_SIZE = 4;
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    yield { type: "chunk", content: tokens.slice(i, i + CHUNK_SIZE).join("") };
    await new Promise<void>(resolve => setTimeout(resolve, 15));
  }
  yield { type: "done" };
}

export async function* generateOpenAIStream(
  userMessage: string,
  memory: IHealthMemory | null,
  history: ChatHistoryMessage[],
  apiKey: string,
  clinicalSummaryBlock?: string
): AsyncGenerator<StreamChunk> {
  // Safety layer — always enforced regardless of AI provider
  const safety = analyzeSafety(userMessage);

  if (safety.isEmergency) {
    yield* streamText(EMERGENCY_RESPONSE(safety.emergencyKeywords));
    return;
  }

  if (safety.isDiagnosisRequest) {
    yield* streamText(DIAGNOSIS_RESPONSE);
    return;
  }

  if (safety.isPrescriptionRequest) {
    yield* streamText(PRESCRIPTION_RESPONSE);
    return;
  }

  const client = new OpenAI({ apiKey, timeout: 30_000 });

  const systemPrompt = buildSystemPrompt(memory, clinicalSummaryBlock);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  // This awaited call can throw (auth error, connection error, etc.)
  // before we yield anything — the caller should catch and fall back.
  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 1024,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield { type: "chunk", content };
    }
  }

  yield { type: "done" };
}
