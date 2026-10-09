import { Document } from "@langchain/core/documents";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ similaritySearchWithScore: vi.fn() }));

vi.mock("../../src/rag/ingest.js", () => ({
  getVectorStore: async () => ({ similaritySearchWithScore: mocks.similaritySearchWithScore }),
}));

const { retrieve } = await import("../../src/rag/retriever.js");

describe("rag: retriever", () => {
  it("BACK-RAG-01 maps scored documents to {content, source, score} using k=4 by default", async () => {
    mocks.similaritySearchWithScore.mockResolvedValue([
      [new Document({ pageContent: "Primer fragmento", metadata: { source: "a.md" } }), 0.91],
      [new Document({ pageContent: "Segundo fragmento", metadata: { source: "b.txt" } }), 0.85],
    ]);

    const chunks = await retrieve("¿Vacaciones?");

    expect(mocks.similaritySearchWithScore).toHaveBeenCalledWith("¿Vacaciones?", 4);
    expect(chunks).toEqual([
      { content: "Primer fragmento", source: "a.md", score: 0.91 },
      { content: "Segundo fragmento", source: "b.txt", score: 0.85 },
    ]);
  });

  it("BACK-RAG-02 forwards a custom k and stringifies the source metadata", async () => {
    mocks.similaritySearchWithScore.mockResolvedValue([[new Document({ pageContent: "x", metadata: {} }), 0.5]]);

    const chunks = await retrieve("q", 2);

    expect(mocks.similaritySearchWithScore).toHaveBeenCalledWith("q", 2);
    expect(chunks).toEqual([{ content: "x", source: "undefined", score: 0.5 }]);
  });
});
