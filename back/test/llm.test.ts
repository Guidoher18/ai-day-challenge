import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ctorArgs: [] as { provider: string; fields: unknown }[] }));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    constructor(fields: unknown) {
      mocks.ctorArgs.push({ provider: "openai", fields });
    }
  },
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    constructor(fields: unknown) {
      mocks.ctorArgs.push({ provider: "anthropic", fields });
    }
  },
}));

const ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_MODEL",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "OPENROUTER_MODEL",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

async function loadClient(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key]);
  vi.resetModules();
  mocks.ctorArgs.length = 0;
  await import("../src/llm.js");
  return mocks.ctorArgs[0];
}

async function loadConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  const client = await loadClient(env);
  expect(client?.provider).toBe("openai");
  return client?.fields;
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

  it("BACK-LLM-03 uses ChatAnthropic with the default Claude model when LLM_PROVIDER is anthropic", async () => {
    const client = await loadClient({ LLM_PROVIDER: "Anthropic", ANTHROPIC_API_KEY: "sk-ant-key" });

    expect(client?.provider).toBe("anthropic");
    expect(client?.fields).toMatchObject({ model: "claude-opus-5-5", apiKey: "sk-ant-key", maxTokens: 16000 });
    expect(client?.fields).not.toHaveProperty("temperature");
  });

  it("BACK-LLM-04 lets LLM_MODEL and LLM_API_KEY override the Claude defaults", async () => {
    const client = await loadClient({
      LLM_PROVIDER: "anthropic",
      LLM_MODEL: "claude-haiku-5-5",
      LLM_API_KEY: "llm-key",
      ANTHROPIC_API_KEY: "sk-ant-key",
    });

    expect(client?.provider).toBe("anthropic");
    expect(client?.fields).toMatchObject({ model: "claude-haiku-5-5", apiKey: "llm-key" });
  });
});
