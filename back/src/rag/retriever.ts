import { getVectorStore } from "./ingest.js";

export interface RetrievedChunk {
  content: string;
  source: string;
  score: number;
}

export async function retrieve(question: string, k = 4): Promise<RetrievedChunk[]> {
  const vectorStore = await getVectorStore();
  const results = await vectorStore.similaritySearchWithScore(question, k);
  return results.map(([doc, score]) => ({
    content: doc.pageContent,
    source: String(doc.metadata.source),
    score,
  }));
}
