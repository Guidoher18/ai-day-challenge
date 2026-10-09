import { AIMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  llmInvoke: vi.fn(),
  boundInvoke: vi.fn(),
  bindTools: vi.fn(),
  retrieve: vi.fn(),
  getMcpTools: vi.fn(),
  logInteraction: vi.fn(),
}));

vi.mock("../src/llm.js", () => ({
  llm: { invoke: mocks.llmInvoke, bindTools: mocks.bindTools },
}));
vi.mock("../src/rag/retriever.js", () => ({ retrieve: mocks.retrieve }));
vi.mock("../src/mcp/client.js", () => ({ getMcpTools: mocks.getMcpTools }));
vi.mock("../src/log.js", () => ({ logInteraction: mocks.logInteraction }));

const { answerQuestion } = await import("../src/graph.js");

const text = (content: string) => new AIMessage({ content });
const toolCall = (name: string, args: Record<string, unknown> = {}, id = `call-${name}`) =>
  new AIMessage({ content: "", tool_calls: [{ name, args, id }] });
const chunk = (score: number, content = "Las vacaciones se piden con 15 días de anticipación.") => ({
  content,
  source: "pedido-de-vacaciones.md",
  score,
});
const fakeTool = (name: string, invoke = vi.fn()) => ({ name, invoke });

/** Snapshots the message list on each bound-model call (the graph mutates the same array). */
function recordBoundCalls(responses: AIMessage[]): BaseMessage[][] {
  const snapshots: BaseMessage[][] = [];
  mocks.boundInvoke.mockImplementation(async (messages: BaseMessage[]) => {
    snapshots.push([...messages]);
    return responses[Math.min(snapshots.length - 1, responses.length - 1)];
  });
  return snapshots;
}

beforeEach(() => {
  mocks.bindTools.mockReturnValue({ invoke: mocks.boundInvoke });
  mocks.getMcpTools.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("graph: classify", () => {
  it("BACK-GRAPH-01 routes to execute when the classifier answer contains 'ejecutar' among other text", async () => {
    mocks.llmInvoke.mockResolvedValueOnce(text("Ruta elegida: **Ejecutar**."));
    mocks.getMcpTools.mockResolvedValue([fakeTool("consultar_calendario", vi.fn().mockResolvedValue("[]"))]);
    recordBoundCalls([toolCall("consultar_calendario"), text("No hay eventos.")]);

    const result = await answerQuestion("¿Qué reuniones hay mañana?");

    expect(result.route).toBe("ejecutar");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("BACK-GRAPH-02 picks the route mentioned first when several routes appear", async () => {
    mocks.llmInvoke.mockResolvedValueOnce(text("escalar (no corresponde responder)"));

    const result = await answerQuestion("¿Me aprobás un aumento?");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.getMcpTools).not.toHaveBeenCalled();
  });

  it("BACK-GRAPH-03 defaults to 'responder' when the classifier answer has no known route", async () => {
    mocks.llmInvoke.mockResolvedValueOnce(text("no sé")).mockResolvedValueOnce(text("Con 15 días de anticipación."));
    mocks.retrieve.mockResolvedValue([chunk(0.9)]);

    const result = await answerQuestion("¿Cómo pido vacaciones?");

    expect(mocks.retrieve).toHaveBeenCalledWith("¿Cómo pido vacaciones?");
    expect(result).toEqual({ answer: "Con 15 días de anticipación.", route: "responder", escalated: false });
  });
});

describe("graph: respond", () => {
  beforeEach(() => {
    mocks.llmInvoke.mockResolvedValueOnce(text("responder"));
  });

  it("BACK-GRAPH-04 answers from the retrieved context (happy path)", async () => {
    mocks.retrieve.mockResolvedValue([chunk(0.88), chunk(0.86, "Segundo fragmento")]);
    mocks.llmInvoke.mockResolvedValueOnce(text("  Se piden con 15 días de anticipación.  "));

    const result = await answerQuestion("¿Cómo pido vacaciones?");

    expect(result).toEqual({ answer: "Se piden con 15 días de anticipación.", route: "responder", escalated: false });
    const [messages] = mocks.llmInvoke.mock.calls[1];
    expect(messages[0].content).toContain("[pedido-de-vacaciones.md]\nLas vacaciones se piden");
    expect(messages[0].content).toContain("Segundo fragmento");
    expect(messages[1]).toEqual({ role: "user", content: "¿Cómo pido vacaciones?" });
  });

  it("BACK-GRAPH-05 escalates without calling the LLM when the best score is below 0.83", async () => {
    mocks.retrieve.mockResolvedValue([chunk(0.829)]);

    const result = await answerQuestion("¿Cuál es la capital de Francia?");

    expect(result.route).toBe("escalar");
    expect(result.escalated).toBe(true);
    expect(result.answer).toContain("la consulta no está cubierta por la documentación disponible");
    expect(mocks.llmInvoke).toHaveBeenCalledTimes(1);
  });

  it("BACK-GRAPH-06 accepts a best score exactly at the 0.83 threshold", async () => {
    mocks.retrieve.mockResolvedValue([chunk(0.83)]);
    mocks.llmInvoke.mockResolvedValueOnce(text("Respuesta."));

    const result = await answerQuestion("¿Cómo pido vacaciones?");

    expect(result).toMatchObject({ route: "responder", escalated: false });
  });

  it("BACK-GRAPH-07 escalates when no chunks are retrieved", async () => {
    mocks.retrieve.mockResolvedValue([]);

    const result = await answerQuestion("¿Algo?");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("la consulta no está cubierta por la documentación disponible");
  });

  it("BACK-GRAPH-08 escalates when the answer starts with the SIN_CONTEXTO sentinel", async () => {
    mocks.retrieve.mockResolvedValue([chunk(0.9)]);
    mocks.llmInvoke.mockResolvedValueOnce(text("  SIN_CONTEXTO. No tengo información."));

    const result = await answerQuestion("¿Cómo pido vacaciones?");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("la documentación no alcanza para responder la consulta");
  });

  it("BACK-GRAPH-09 strips sentences mentioning the sentinel and still answers", async () => {
    mocks.retrieve.mockResolvedValue([chunk(0.9)]);
    mocks.llmInvoke.mockResolvedValueOnce(text("Se piden con 15 días de anticipación. No corresponde SIN_CONTEXTO."));

    const result = await answerQuestion("¿Cómo pido vacaciones?");

    expect(result).toEqual({ answer: "Se piden con 15 días de anticipación.", route: "responder", escalated: false });
  });

  it("BACK-GRAPH-10 escalates when the LLM returns an empty answer", async () => {
    mocks.retrieve.mockResolvedValue([chunk(0.9)]);
    mocks.llmInvoke.mockResolvedValueOnce(text("   "));

    const result = await answerQuestion("¿Cómo pido vacaciones?");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("la documentación no alcanza para responder la consulta");
  });
});

describe("graph: execute", () => {
  beforeEach(() => {
    mocks.llmInvoke.mockResolvedValueOnce(text("ejecutar"));
  });

  it("BACK-GRAPH-11 runs the requested tool and returns the model's final answer", async () => {
    const calendar = fakeTool("consultar_calendario", vi.fn().mockResolvedValue({ eventos: ["Daily"] }));
    const draft = fakeTool("redactar_borrador");
    mocks.getMcpTools.mockResolvedValue([calendar, draft]);
    const snapshots = recordBoundCalls([
      toolCall("consultar_calendario", { fecha: "2026-10-10" }, "c1"),
      text(" Mañana hay una daily. "),
    ]);

    const result = await answerQuestion("¿Qué reuniones hay mañana?");

    expect(result).toEqual({ answer: "Mañana hay una daily.", route: "ejecutar", escalated: false });
    expect(mocks.bindTools).toHaveBeenCalledWith([calendar, draft]);
    expect(calendar.invoke).toHaveBeenCalledWith({ fecha: "2026-10-10" });
    const toolMessage = snapshots[1].at(-1) as ToolMessage;
    expect(toolMessage).toBeInstanceOf(ToolMessage);
    expect(toolMessage.content).toBe(JSON.stringify({ eventos: ["Daily"] }));
    expect(toolMessage.tool_call_id).toBe("c1");
  });

  it("BACK-GRAPH-12 mentions only the loaded tools in the system prompt (dynamic guidance)", async () => {
    mocks.getMcpTools.mockResolvedValue([fakeTool("consultar_calendario"), fakeTool("otra_herramienta")]);
    const snapshots = recordBoundCalls([text("Sin herramientas.")]);

    await answerQuestion("¿Qué reuniones hay?");

    const prompt = String(snapshots[0][0].content);
    expect(prompt).toContain("- consultar_calendario: reuniones, eventos o agenda del equipo.");
    expect(prompt).toContain("- otra_herramienta");
    expect(prompt).not.toContain("redactar_borrador");
  });

  it("BACK-GRAPH-13 escalates when the model answers without using any tool", async () => {
    mocks.getMcpTools.mockResolvedValue([fakeTool("consultar_calendario")]);
    recordBoundCalls([text("Mañana hay una reunión a las 10.")]);

    const result = await answerQuestion("¿Qué reuniones hay mañana?");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("no fue posible completar la acción solicitada de forma automática");
  });

  it("BACK-GRAPH-14 escalates when the model requests an unknown tool", async () => {
    mocks.getMcpTools.mockResolvedValue([fakeTool("consultar_calendario")]);
    recordBoundCalls([toolCall("borrar_todo")]);

    const result = await answerQuestion("Borrá todo");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("no se encontró la herramienta solicitada (borrar_todo)");
  });

  it("BACK-GRAPH-15 escalates when a tool throws, without leaking the error", async () => {
    mocks.getMcpTools.mockResolvedValue([fakeTool("consultar_calendario", vi.fn().mockRejectedValue(new Error("boom")))]);
    recordBoundCalls([toolCall("consultar_calendario")]);

    const result = await answerQuestion("¿Qué reuniones hay?");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("ocurrió un error al ejecutar la acción solicitada");
    expect(result.answer).not.toContain("boom");
  });

  it("BACK-GRAPH-16 truncates tool output longer than 6000 characters", async () => {
    const longOutput = "x".repeat(7000);
    mocks.getMcpTools.mockResolvedValue([fakeTool("consultar_calendario", vi.fn().mockResolvedValue(longOutput))]);
    const snapshots = recordBoundCalls([toolCall("consultar_calendario"), text("Listo.")]);

    await answerQuestion("¿Qué reuniones hay?");

    expect(snapshots[1].at(-1)?.content).toBe(`${"x".repeat(6000)}\n[... resultado truncado]`);
  });

  it("BACK-GRAPH-17 keeps tool output of exactly 6000 characters untouched", async () => {
    const output = "y".repeat(6000);
    mocks.getMcpTools.mockResolvedValue([fakeTool("consultar_calendario", vi.fn().mockResolvedValue(output))]);
    const snapshots = recordBoundCalls([toolCall("consultar_calendario"), text("Listo.")]);

    await answerQuestion("¿Qué reuniones hay?");

    expect(snapshots[1].at(-1)?.content).toBe(output);
  });

  it("BACK-GRAPH-18 escalates after 4 model iterations that keep requesting tools", async () => {
    const calendar = fakeTool("consultar_calendario", vi.fn().mockResolvedValue("[]"));
    mocks.getMcpTools.mockResolvedValue([calendar]);
    recordBoundCalls([toolCall("consultar_calendario")]);

    const result = await answerQuestion("¿Qué reuniones hay?");

    expect(mocks.boundInvoke).toHaveBeenCalledTimes(4);
    expect(calendar.invoke).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("no fue posible completar la acción solicitada de forma automática");
  });

  it("BACK-GRAPH-19 escalates when loading the MCP tools fails", async () => {
    mocks.getMcpTools.mockRejectedValue(new Error("spawn failed"));

    const result = await answerQuestion("¿Qué reuniones hay?");

    expect(result).toMatchObject({ route: "escalar", escalated: true });
    expect(result.answer).toContain("ocurrió un error al ejecutar la acción solicitada");
  });
});

describe("graph: escalate and logging", () => {
  it("BACK-GRAPH-20 builds the pending message with the default reason for direct escalations", async () => {
    mocks.llmInvoke.mockResolvedValueOnce(text("escalar"));

    const result = await answerQuestion("¿Me aprobás un aumento de sueldo?");

    expect(result).toEqual({
      answer:
        "Tu consulta quedó registrada como pendiente porque requiere la intervención de una persona. Se atenderá cuando la persona responsable regrese.",
      route: "escalar",
      escalated: true,
    });
  });

  it("BACK-GRAPH-21 logs each answered question exactly once with its result fields", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
    try {
      mocks.llmInvoke.mockResolvedValueOnce(text("escalar"));

      const result = await answerQuestion("¿Me aprobás un aumento?");

      expect(mocks.logInteraction).toHaveBeenCalledTimes(1);
      expect(mocks.logInteraction).toHaveBeenCalledWith({
        question: "¿Me aprobás un aumento?",
        ...result,
        date: "2026-10-09T12:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
