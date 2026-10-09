import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ctorArgs: [] as unknown[] }));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    constructor(fields: unknown) {
      mocks.ctorArgs.push(fields);
    }
  },
}));

const ENV_KEYS = ["LLM_MODEL", "LLM_API_KEY", "LLM_BASE_URL", "OPENROUTER_MODEL", "OPENROUTER_API_KEY"] as const;

async function loadConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key]);
  vi.resetModules();
  mocks.ctorArgs.length = 0;
  await import("../src/llm.js");
  return mocks.ctorArgs[0];
}

beforeEach(() => {
  mocks.ctorArgs.length = 0;
});

describe("llm config", () => {
  it("BACK-LLM-01 prefers LLM_* variables over OPENROUTER_* ones", async () => {
    const config = await loadConfig({
      LLM_MODEL: "llm-model",
      LLM_API_KEY: "llm-key",
      LLM_BASE_URL: "https://llm.example/v1",
      OPENROUTER_MODEL: "or-model",
      OPENROUTER_API_KEY: "or-key",
    });

    expect(config).toEqual({
      model: "llm-model",
      apiKey: "llm-key",
      configuration: { baseURL: "https://llm.example/v1" },
      temperature: 0,
    });
  });

  it("BACK-LLM-02 falls back to OPENROUTER_* variables and the OpenRouter base URL", async () => {
    const config = await loadConfig({ OPENROUTER_MODEL: "or-model", OPENROUTER_API_KEY: "or-key" });

    expect(config).toEqual({
      model: "or-model",
      apiKey: "or-key",
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      temperature: 0,
    });
  });
});
