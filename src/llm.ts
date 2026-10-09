import { ChatOpenAI } from "@langchain/openai";

// Requires env vars to be loaded first ("dotenv/config" is the first import in server.ts).
export const llm = new ChatOpenAI({
  model: process.env.OPENROUTER_MODEL,
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
  temperature: 0,
});
