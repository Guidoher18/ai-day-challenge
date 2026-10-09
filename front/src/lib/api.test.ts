import { beforeEach, describe, expect, it, vi } from "vitest";
import { askQuestion, checkHealth, fetchHandoff } from "./api";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function invalidJsonResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("lib/api", () => {
  it("FRONT-API-01 askQuestion POSTs the question as JSON to /api/consulta and returns the parsed body", async () => {
    const body = { respuesta: "Hola", ruta: "responder", escalada: false };
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    await expect(askQuestion("¿Cómo pido vacaciones?")).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("/api/consulta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta: "¿Cómo pido vacaciones?" }),
    });
  });

  it("FRONT-API-02 fetchHandoff GETs /api/traspaso and returns the parsed body", async () => {
    const body = { total: 0, respondidas: 0, ejecutadas: 0, escaladas: 0, resumen: "", pendientes: [] };
    fetchMock.mockResolvedValue(jsonResponse(200, body));

    await expect(fetchHandoff()).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith("/api/traspaso", undefined);
  });

  it("FRONT-API-03 surfaces the backend 'error' text on non-OK responses", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: "Missing body field 'pregunta'" }));

    await expect(askQuestion("")).rejects.toThrow("Missing body field 'pregunta'");
  });

  it("FRONT-API-04 uses a generic status message when the error body is not usable", async () => {
    fetchMock.mockResolvedValueOnce(invalidJsonResponse(502)).mockResolvedValueOnce(jsonResponse(500, { error: 42 }));

    await expect(fetchHandoff()).rejects.toThrow("Error 502 del servidor.");
    await expect(fetchHandoff()).rejects.toThrow("Error 500 del servidor.");
  });

  it("FRONT-API-05 reports a connection message when fetch itself fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(askQuestion("Hola")).rejects.toThrow("No se pudo conectar con el servidor.");
  });

  it("FRONT-API-06 checkHealth probes /api/health without cache and maps the result to a boolean", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { status: "ok" }))
      .mockResolvedValueOnce(jsonResponse(503, null))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(checkHealth()).resolves.toBe(true);
    await expect(checkHealth()).resolves.toBe(false);
    await expect(checkHealth()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
  });
});
