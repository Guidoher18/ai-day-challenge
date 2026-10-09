import { describe, expect, it } from "vitest";
import { getInteractions, logInteraction, type Interaction } from "../src/log.js";

describe("log", () => {
  it("BACK-LOG-01 starts empty and returns appended interactions in insertion order", () => {
    expect(getInteractions()).toEqual([]);

    const first: Interaction = { question: "¿A?", route: "responder", answer: "A", escalated: false, date: "2026-10-09T10:00:00.000Z" };
    const second: Interaction = { question: "¿B?", route: "escalar", answer: "B", escalated: true, date: "2026-10-09T11:00:00.000Z" };
    logInteraction(first);
    logInteraction(second);

    expect(getInteractions()).toEqual([first, second]);
  });
});
