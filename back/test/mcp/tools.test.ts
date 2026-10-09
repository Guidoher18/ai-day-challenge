import { describe, expect, it } from "vitest";
import { buildCalendar, buildDraft, isoDate, listCalendarEvents } from "../../src/mcp/tools.js";

// Local time on purpose: the calendar works with local dates.
const START = new Date(2026, 9, 9, 9, 0);

describe("mcp tools: consultar_calendario", () => {
  it("BACK-MCP-01 formats local dates as YYYY-MM-DD across month boundaries", () => {
    expect(isoDate(0, START)).toBe("2026-10-09");
    expect(isoDate(23, START)).toBe("2026-11-01");
  });

  it("BACK-MCP-02 returns only the events of the requested date", () => {
    const result = listCalendarEvents(buildCalendar(START), "2026-10-10", START);

    expect(result.hoy).toBe("2026-10-09");
    expect(result.fecha).toBe("2026-10-10");
    expect(result.eventos.map((e) => e.title)).toEqual(["Revisión del sprint"]);
  });

  it("BACK-MCP-03 returns an empty list for a date without events", () => {
    const result = listCalendarEvents(buildCalendar(START), "2026-10-14", START);

    expect(result.eventos).toEqual([]);
  });

  it("BACK-MCP-04 returns upcoming events (today onwards) when no date is given", () => {
    const events = buildCalendar(START);
    const twoDaysLater = new Date(2026, 9, 11, 9, 0);

    const result = listCalendarEvents(events, undefined, twoDaysLater);

    expect(result.fecha).toBeNull();
    expect(result.hoy).toBe("2026-10-11");
    expect(result.eventos.map((e) => e.date)).toEqual(["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-15"]);
  });
});

describe("mcp tools: redactar_borrador", () => {
  it("BACK-MCP-05 renders a single point as plain text inside the draft template", () => {
    const draft = buildDraft({ destinatario: "Laura", asunto: "Revisión", puntos: "  La revisión pasa al jueves.  " });

    expect(draft.split("\n")).toEqual([
      "[BORRADOR - NO ENVIADO]",
      "Para: Laura",
      "Asunto: Revisión",
      "",
      "Hola Laura:",
      "",
      "Te escribo para comentarte lo siguiente:",
      "La revisión pasa al jueves.",
      "",
      "La persona responsable se encuentra ausente; este mensaje fue redactado por su suplente digital y queda pendiente de revisión antes de enviarse.",
      "",
      "Saludos,",
      "Suplente digital del equipo",
    ]);
  });

  it("BACK-MCP-06 renders several points as a bulleted list, dropping blank ones", () => {
    const draft = buildDraft({ destinatario: "Martín", asunto: "Avance", puntos: ["Punto uno", "  ", " Punto dos "] });

    expect(draft).toContain("Te escribo para comentarte lo siguiente:\n- Punto uno\n- Punto dos\n");
  });

  it("BACK-MCP-07 treats a one-element array like a single point", () => {
    const draft = buildDraft({ destinatario: "Sofía", asunto: "Hola", puntos: ["Único punto"] });

    expect(draft).toContain("Te escribo para comentarte lo siguiente:\nÚnico punto\n");
    expect(draft).not.toContain("- Único punto");
  });
});
