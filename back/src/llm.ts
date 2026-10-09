import { ChatOpenAI } from "@langchain/openai";

// Any OpenAI-compatible provider works (OpenRouter, Groq, Google AI Studio, ...).
// LLM_* vars take precedence; OPENROUTER_* are kept as a fallback for existing setups.
// Requires env vars to be loaded first ("dotenv/config" is the first import in server.ts).
export const llm = new ChatOpenAI({
  model: process.env.LLM_MODEL ?? process.env.OPENROUTER_MODEL,
  apiKey: process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY,
  configuration: { baseURL: process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1" },
  temperature: 0,
});
