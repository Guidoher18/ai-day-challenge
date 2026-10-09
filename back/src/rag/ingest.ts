import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { LocalEmbeddings } from "./embeddings.js";

const DOCS_DIR = path.resolve(process.cwd(), "docs");
const SUPPORTED_EXTENSIONS = [".md", ".txt"];

let vectorStorePromise: Promise<MemoryVectorStore> | undefined;

async function loadDocuments(): Promise<Document[]> {
  const files = (await readdir(DOCS_DIR)).filter((file) =>
    SUPPORTED_EXTENSIONS.includes(path.extname(file).toLowerCase()),
  );
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(path.join(DOCS_DIR, file), "utf-8");
      return new Document({ pageContent: content, metadata: { source: file } });
    }),
  );
}

async function buildVectorStore(): Promise<MemoryVectorStore> {
  const documents = await loadDocuments();
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 80 });
  const chunks = await splitter.splitDocuments(documents);

  const vectorStore = new MemoryVectorStore(new LocalEmbeddings());
  await vectorStore.addDocuments(chunks);
  console.log(`Ingested ${documents.length} documents into ${chunks.length} chunks`);
  return vectorStore;
}

export function getVectorStore(): Promise<MemoryVectorStore> {
  vectorStorePromise ??= buildVectorStore();
  return vectorStorePromise;
}
