import { Embeddings } from "@langchain/core/embeddings";
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Multilingual model (Spanish-friendly). E5 models expect "query: " / "passage: " prefixes.
const MODEL_ID = "Xenova/multilingual-e5-small";

/**
 * Local embeddings over transformers.js (mean pooling + L2 normalization).
 * Written in-house because @langchain/community is no longer maintained.
 */
export class LocalEmbeddings extends Embeddings {
  private extractor?: Promise<FeatureExtractionPipeline>;

  constructor() {
    super({});
  }

  private getExtractor(): Promise<FeatureExtractionPipeline> {
    this.extractor ??= pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
    return this.extractor;
  }

  private async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist() as number[][];
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return this.embed(documents.map((doc) => `passage: ${doc}`));
  }

  async embedQuery(query: string): Promise<number[]> {
    const [vector] = await this.embed([`query: ${query}`]);
    return vector;
  }
}
