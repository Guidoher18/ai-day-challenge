import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  answerQuestion: vi.fn(),
  buildHandoff: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("../src/graph.js", () => ({ answerQuestion: mocks.answerQuestion }));
vi.mock("../src/handoff.js", () => ({ buildHandoff: mocks.buildHandoff }));
vi.mock("../src/rag/retriever.js", () => ({ retrieve: mocks.retrieve }));

const { createApp } = await import("../src/app.js");
const app = createApp();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("api", () => {
  it("BACK-API-01 GET /health returns status ok and a numeric uptime", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", uptime: expect.any(Number) });
  });

  it("BACK-API-02 POST /consulta returns 400 when 'pregunta' is missing", async () => {
    const res = await request(app).post("/consulta").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing body field 'pregunta'" });
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
  });

  it("BACK-API-03 POST /consulta returns 400 when 'pregunta' is blank or not a string", async () => {
    const blank = await request(app).post("/consulta").send({ pregunta: "   " });
    const notString = await request(app).post("/consulta").send({ pregunta: 42 });

    expect(blank.status).toBe(400);
    expect(notString.status).toBe(400);
    expect(mocks.answerQuestion).not.toHaveBeenCalled();
  });

  it("BACK-API-04 POST /consulta maps the graph result to the Spanish response contract", async () => {
    mocks.answerQuestion.mockResolvedValue({ answer: "Con 15 días.", route: "responder", escalated: false });

    const res = await request(app).post("/consulta").send({ pregunta: "  ¿Cómo pido vacaciones?  " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ respuesta: "Con 15 días.", ruta: "responder", escalada: false });
    expect(mocks.answerQuestion).toHaveBeenCalledWith("¿Cómo pido vacaciones?");
  });

  it("BACK-API-05 POST /consulta returns 500 with a generic message without leaking the error", async () => {
    mocks.answerQuestion.mockRejectedValue(new Error("secret upstream failure"));

    const res = await request(app).post("/consulta").send({ pregunta: "¿Hola?" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "No se pudo procesar la consulta. Intentá nuevamente más tarde." });
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });

  it("BACK-API-06 GET /buscar returns 400 without a 'q' parameter", async () => {
    const res = await request(app).get("/buscar");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Missing query parameter 'q'" });
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("BACK-API-07 GET /buscar returns the trimmed query and the retrieval results", async () => {
    const results = [{ content: "Texto", source: "faq.md", score: 0.9 }];
    mocks.retrieve.mockResolvedValue(results);

    const res = await request(app).get("/buscar").query({ q: "  vacaciones " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ query: "vacaciones", results });
    expect(mocks.retrieve).toHaveBeenCalledWith("vacaciones");
  });

  it("BACK-API-08 GET /traspaso returns the handoff built by buildHandoff", async () => {
    const handoff = { total: 1, respondidas: 1, ejecutadas: 0, escaladas: 0, resumen: "Resumen", pendientes: [] };
    mocks.buildHandoff.mockResolvedValue(handoff);

    const res = await request(app).get("/traspaso");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(handoff);
  });
});
