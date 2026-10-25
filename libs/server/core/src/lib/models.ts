import type { FeatureExtractionPipeline } from '@huggingface/transformers';

export const EMBEDDING_DIM = 384;

// bge models expect this instruction in front of queries (not documents).
const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

// transformers.js is ESM-first and heavy; load it on first use only.
const loadTransformers = async (cacheDir: string) => {
  const transformers = await import('@huggingface/transformers');
  transformers.env.cacheDir = cacheDir;
  return transformers;
};

/** Local sentence embeddings (bge-small, 384 dims) via transformers.js. */
export class Embedder {
  private extractor?: Promise<FeatureExtractionPipeline>;

  constructor(
    private readonly model: string,
    private readonly cacheDir: string,
  ) {}

  private load(): Promise<FeatureExtractionPipeline> {
    this.extractor ??= loadTransformers(this.cacheDir).then(
      ({ pipeline }) =>
        pipeline('feature-extraction', this.model, { dtype: 'q8' }) as Promise<FeatureExtractionPipeline>,
    );
    return this.extractor;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const extractor = await this.load();
    const output = await extractor(texts, { pooling: 'cls', normalize: true });
    return output.tolist() as number[][];
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedDocuments([BGE_QUERY_PREFIX + text]);
    return embedding;
  }

  warmUp(): Promise<unknown> {
    return this.load();
  }
}
