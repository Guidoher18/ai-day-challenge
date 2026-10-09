import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";

const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

// LLM_PROVIDER=anthropic uses Claude through the official Anthropic SDK (via ChatAnthropic).
// Any other value (or unset) uses an OpenAI-compatible provider (OpenRouter, Groq, Google AI Studio, ...).
// LLM_* vars take precedence; OPENROUTER_* are kept as a fallback for existing setups.
// Requires env vars to be loaded first ("dotenv/config" is the first import in server.ts).
function createLlm(): ChatAnthropic | ChatOpenAI {
  if (process.env.LLM_PROVIDER?.trim().toLowerCase() === "anthropic") {
    return new ChatAnthropic({
      model: process.env.LLM_MODEL || DEFAULT_CLAUDE_MODEL,
      // Falls back to ANTHROPIC_API_KEY, which the Anthropic SDK reads by default.
      apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY,
      // Leaves room for adaptive thinking plus the answer. No temperature: current Claude models reject sampling params.
      maxTokens: 16000,
      // Server-side fallback: if a safety classifier declines, Anthropic retries on a suitable model.
      betas: ["server-side-fallback-2026-07-01"],
      invocationKwargs: { fallbacks: "default" },
    });
  }
  return new ChatOpenAI({
    model: process.env.LLM_MODEL ?? process.env.OPENROUTER_MODEL,
    apiKey: process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1" },
    temperature: 0,
  });
}

export const llm = createLlm();
