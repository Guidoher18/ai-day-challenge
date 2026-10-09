import { AIMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Interaction } from "../src/log.js";

const mocks = vi.hoisted(() => ({
  llmInvoke: vi.fn(),
  getInteractions: vi.fn(),
}));

vi.mock("../src/llm.js", () => ({ llm: { invoke: mocks.llmInvoke } }));
vi.mock("../src/log.js", () => ({ getInteractions: mocks.getInteractions }));

const { buildHandoff } = await import("../src/handoff.js");

const interaction = (overrides: Partial<Interaction>): Interaction => ({
  question: "¿Pregunta?",
  route: "responder",
  answer: "Respuesta",
  escalated: false,
  date: "2026-10-09T12:00:00.000Z",
  ...overrides,
});

const sample: Interaction[] = [
  interaction({ question: "¿Cómo pido vacaciones?", route: "responder" }),
  interaction({ question: "¿Cómo pido un reintegro?", route: "responder" }),
  interaction({ question: "¿Qué reuniones hay?", route: "ejecutar" }),
  interaction({ question: "¿Me aprobás un aumento?", route: "escalar", escalated: true, date: "2026-10-09T13:00:00.000Z" }),
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("handoff", () => {
  it("BACK-HANDOFF-01 returns zero counters and a fixed summary without calling the LLM when nothing was logged", async () => {
    mocks.getInteractions.mockReturnValue([]);

    const handoff = await buildHandoff();

    expect(handoff).toEqual({
      total: 0,
      respondidas: 0,
      ejecutadas: 0,
      escaladas: 0,
      pendientes: [],
      resumen: "No se registraron consultas durante la ausencia.",
    });
    expect(mocks.llmInvoke).not.toHaveBeenCalled();
  });

  it("BACK-HANDOFF-02 counts interactions by route and uses the LLM summary", async () => {
    mocks.getInteractions.mockReturnValue(sample);
    mocks.llmInvoke.mockResolvedValue(new AIMessage({ content: "  Resumen del período.  " }));

    const handoff = await buildHandoff();

    expect(handoff).toMatchObject({ total: 4, respondidas: 2, ejecutadas: 1, escaladas: 1, resumen: "Resumen del período." });
    const [messages] = mocks.llmInvoke.mock.calls[0];
    expect(messages[1].content).toContain("- [ejecutar] ¿Qué reuniones hay? -> Respuesta");
  });

  it("BACK-HANDOFF-03 lists only escalated interactions as pending, with question and date", async () => {
    mocks.getInteractions.mockReturnValue(sample);
    mocks.llmInvoke.mockResolvedValue(new AIMessage({ content: "Resumen" }));

    const handoff = await buildHandoff();

    expect(handoff.pendientes).toEqual([{ pregunta: "¿Me aprobás un aumento?", fecha: "2026-10-09T13:00:00.000Z" }]);
  });

  it("BACK-HANDOFF-04 falls back to a counts-based summary when the LLM fails", async () => {
    mocks.getInteractions.mockReturnValue(sample);
    mocks.llmInvoke.mockRejectedValue(new Error("429 rate limited"));

    const handoff = await buildHandoff();

    expect(handoff.resumen).toBe("Se atendieron 4 consultas: 2 respondidas, 1 ejecutadas y 1 escaladas.");
    expect(handoff.total).toBe(4);
  });

  it("BACK-HANDOFF-05 falls back to the counts-based summary when the LLM returns empty text", async () => {
    mocks.getInteractions.mockReturnValue(sample);
    mocks.llmInvoke.mockResolvedValue(new AIMessage({ content: "   " }));

    const handoff = await buildHandoff();

    expect(handoff.resumen).toBe("Se atendieron 4 consultas: 2 respondidas, 1 ejecutadas y 1 escaladas.");
  });

  it("BACK-HANDOFF-06 truncates each logged answer to 200 characters in the LLM record", async () => {
    mocks.getInteractions.mockReturnValue([interaction({ answer: "a".repeat(300) })]);
    mocks.llmInvoke.mockResolvedValue(new AIMessage({ content: "Resumen" }));

    await buildHandoff();

    const [messages] = mocks.llmInvoke.mock.calls[0];
    expect(messages[1].content).toContain(`-> ${"a".repeat(200)}`);
    expect(messages[1].content).not.toContain("a".repeat(201));
  });
});
