import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Tiny deterministic embeddings (letter frequencies) so no model is downloaded or loaded.
vi.mock("../../src/rag/embeddings.js", async () => {
  const { Embeddings } = await import("@langchain/core/embeddings");
  const vectorize = (text: string) => {
    const counts = new Array<number>(26).fill(0);
    for (const ch of text.toLowerCase()) {
      const i = ch.charCodeAt(0) - 97;
      if (i >= 0 && i < 26) counts[i]++;
    }
    return counts;
  };
  class LocalEmbeddings extends Embeddings {
    constructor() {
      super({});
    }
    async embedDocuments(documents: string[]) {
      return documents.map(vectorize);
    }
    async embedQuery(query: string) {
      return vectorize(query);
    }
  }
  return { LocalEmbeddings };
});

const originalCwd = process.cwd();
let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "suplente-ingest-"));
  const docs = path.join(tempDir, "docs");
  await mkdir(docs);
  await writeFile(path.join(docs, "vacaciones.md"), "Las vacaciones se piden con quince dias de anticipacion.");
  await writeFile(path.join(docs, "gastos.txt"), "Los gastos se reintegran presentando el comprobante.");
  await writeFile(path.join(docs, "MAYUSCULAS.MD"), "Extension en mayusculas.");
  await writeFile(path.join(docs, "ignorado.pdf"), "No deberia ingerirse.");
  await writeFile(path.join(docs, "largo.md"), Array.from({ length: 60 }, (_, i) => `Oracion numero ${i} del documento largo.`).join(" "));
  // DOCS_DIR is resolved from process.cwd() when ingest.ts is first imported.
  process.chdir(tempDir);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

describe("rag: ingest", () => {
  it("BACK-RAG-03 ingests only .md/.txt files (case-insensitive) with metadata.source and splits long documents", async () => {
    const { getVectorStore } = await import("../../src/rag/ingest.js");

    const store = await getVectorStore();

    const sources = new Set(store.memoryVectors.map((v) => v.metadata.source));
    expect([...sources].sort()).toEqual(["MAYUSCULAS.MD", "gastos.txt", "largo.md", "vacaciones.md"]);
    const longChunks = store.memoryVectors.filter((v) => v.metadata.source === "largo.md");
    expect(longChunks.length).toBeGreaterThan(1);
    expect(longChunks.every((v) => v.content.length <= 500)).toBe(true);
    expect(store.memoryVectors.every((v) => v.embedding.length === 26)).toBe(true);
  });

  it("BACK-RAG-04 builds the vector store once and reuses it", async () => {
    const { getVectorStore } = await import("../../src/rag/ingest.js");

    expect(await getVectorStore()).toBe(await getVectorStore());
  });

  it("BACK-RAG-05 ranks the most similar chunk first with the fake embeddings", async () => {
    const { getVectorStore } = await import("../../src/rag/ingest.js");
    const store = await getVectorStore();

    const [[best]] = await store.similaritySearchWithScore("vacaciones con anticipacion", 1);

    expect(best.metadata.source).toBe("vacaciones.md");
  });
});
