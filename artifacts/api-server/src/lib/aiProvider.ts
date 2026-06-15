import type { IHealthMemory } from "../models/HealthMemory";
import type { IClinicalSummary } from "../models/ClinicalSummaryCache";
import { generateMockStream } from "./mockAiGenerator";
import { generateOpenAIStream } from "./openaiProvider";
import type { StreamChunk, ChatHistoryMessage } from "./openaiProvider";

export type { StreamChunk, ChatHistoryMessage };

export async function* generateStream(
  userMessage: string,
  memory: IHealthMemory | null,
  history: ChatHistoryMessage[] = [],
  clinicalSummary?: IClinicalSummary
): AsyncGenerator<StreamChunk> {
  const apiKey = process.env["OPENAI_API_KEY"];
  const explicitProvider = (process.env["AI_PROVIDER"] ?? "").toLowerCase().trim();

  // Use OpenAI when:
  //   a) OPENAI_API_KEY is present (auto-enable), OR
  //   b) AI_PROVIDER=openai is explicitly set
  // Use mock only when no API key is available.
  const useOpenAI = !!apiKey && explicitProvider !== "mock";

  if (!useOpenAI) {
    console.log("[ai-provider] Using mock AI (no OPENAI_API_KEY or AI_PROVIDER=mock)");
    yield* generateMockStream(userMessage, memory);
    return;
  }

  console.log("[ai-provider] Using GPT-4o-mini");
  let sentAnyChunk = false;

  try {
    for await (const chunk of generateOpenAIStream(userMessage, memory, history, apiKey!, clinicalSummary)) {
      if (chunk.type === "chunk") sentAnyChunk = true;
      yield chunk;
    }
  } catch (err) {
    const errName = (err as { constructor?: { name?: string } })?.constructor?.name ?? "Error";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ai-provider] OpenAI ${errName}: ${errMsg}`);

    if (!sentAnyChunk) {
      console.warn("[ai-provider] Falling back to mock (no output sent yet)");
      yield* generateMockStream(userMessage, memory);
    } else {
      console.warn("[ai-provider] Mid-stream failure — ending response early");
      yield { type: "done" };
    }
  }
}
