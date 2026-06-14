import type { IHealthMemory } from "../models/HealthMemory";
import { generateMockStream } from "./mockAiGenerator";
import { generateOpenAIStream } from "./openaiProvider";
import type { StreamChunk, ChatHistoryMessage } from "./openaiProvider";

export type { StreamChunk, ChatHistoryMessage };

export async function* generateStream(
  userMessage: string,
  memory: IHealthMemory | null,
  history: ChatHistoryMessage[] = []
): AsyncGenerator<StreamChunk> {
  const provider = (process.env["AI_PROVIDER"] ?? "mock").toLowerCase().trim();

  if (provider !== "openai") {
    yield* generateMockStream(userMessage, memory);
    return;
  }

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    console.warn(
      "[ai-provider] AI_PROVIDER=openai but OPENAI_API_KEY is not set — falling back to mock"
    );
    yield* generateMockStream(userMessage, memory);
    return;
  }

  let sentAnyChunk = false;

  try {
    for await (const chunk of generateOpenAIStream(userMessage, memory, history, apiKey)) {
      if (chunk.type === "chunk") sentAnyChunk = true;
      yield chunk;
    }
  } catch (err) {
    const errName = (err as { constructor?: { name?: string } })?.constructor?.name ?? "Error";
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ai-provider] OpenAI ${errName}: ${errMsg}`);

    if (!sentAnyChunk) {
      // Nothing streamed yet — fall back to mock transparently
      console.warn("[ai-provider] Falling back to mock (no output sent yet)");
      yield* generateMockStream(userMessage, memory);
    } else {
      // Already sent partial content — end cleanly rather than mix providers
      console.warn("[ai-provider] Mid-stream failure — ending response early");
      yield { type: "done" };
    }
  }
}
