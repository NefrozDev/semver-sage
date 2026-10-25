import type {
  FeatureExtractionPipeline,
  PreTrainedModel,
  PreTrainedTokenizer,
} from '@huggingface/transformers';

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

/** Local cross-encoder (bge-reranker-base): scores how well each passage answers the query. */
export class Reranker {
  private loaded?: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }>;

  constructor(
    private readonly modelId: string,
    private readonly cacheDir: string,
  ) {}

  private load() {
    this.loaded ??= loadTransformers(this.cacheDir).then(async (t) => ({
      tokenizer: await t.AutoTokenizer.from_pretrained(this.modelId),
      model: await t.AutoModelForSequenceClassification.from_pretrained(this.modelId, {
        dtype: 'q8',
      }),
    }));
    return this.loaded;
  }

  /** Returns one relevance score (0..1) per passage, in input order. */
  async score(query: string, passages: string[]): Promise<number[]> {
    if (!passages.length) return [];
    const { tokenizer, model } = await this.load();
    const inputs = tokenizer(new Array(passages.length).fill(query), {
      text_pair: passages,
      padding: true,
      truncation: true,
      max_length: 512,
    });
    const { logits } = await model(inputs);
    return (logits.sigmoid().tolist() as number[][]).map(([score]) => score);
  }

  warmUp(): Promise<unknown> {
    return this.load();
  }
}
