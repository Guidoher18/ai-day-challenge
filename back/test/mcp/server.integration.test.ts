import { afterAll, describe, expect, it } from "vitest";
import { closeMcpClient, getMcpTools, getMcpToolsets } from "../../src/mcp/client.js";
import { isoDate } from "../../src/mcp/tools.js";

// Spawns the real suplente-tools server over stdio (tsx loader). Offline: no LLM or network involved.
describe("mcp server over stdio (integration)", () => {
  afterAll(async () => {
    await closeMcpClient();
  });

  it("BACK-MCP-08 exposes consultar_calendario and redactar_borrador under the suplente-tools server", async () => {
    const toolsets = await getMcpToolsets();

    expect(Object.keys(toolsets)).toEqual(["suplente-tools"]);
    expect(toolsets["suplente-tools"].map((t) => t.name).sort()).toEqual(["consultar_calendario", "redactar_borrador"]);
  }, 30_000);

  it("BACK-MCP-09 answers tool calls with the same payloads as the pure functions", async () => {
    const tools = new Map((await getMcpTools()).map((t) => [t.name, t]));

    const calendar = String(await tools.get("consultar_calendario")!.invoke({ fecha: isoDate(0) }));
    const draft = String(await tools.get("redactar_borrador")!.invoke({ destinatario: "Laura", asunto: "Hola", puntos: "Prueba" }));

    expect(JSON.parse(calendar)).toMatchObject({ hoy: isoDate(0), fecha: isoDate(0), eventos: [{ title: "Daily del equipo" }] });
    expect(draft.startsWith("[BORRADOR - NO ENVIADO]\nPara: Laura\nAsunto: Hola")).toBe(true);
  }, 30_000);
});
