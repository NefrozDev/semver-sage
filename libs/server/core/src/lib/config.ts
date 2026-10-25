import { resolve } from 'node:path';

let envLoaded = false;

/** Loads `.env` from the working directory once, if present. Real env vars win. */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile();
  } catch {
    // no .env file: defaults apply
  }
}

const str = (name: string, fallback: string) => process.env[name]?.trim() || fallback;
const bool = (name: string, fallback: boolean) => {
  const value = process.env[name]?.trim().toLowerCase();
  return value ? ['1', 'true', 'yes', 'on'].includes(value) : fallback;
};

export interface ServerConfig {
  databaseUrl: string;
  embeddingModel: string;
  rerankerModel: string;
  rerankEnabled: boolean;
  modelCacheDir: string;
  repoCacheDir: string;
  llm: {
    provider: 'ollama' | 'openai';
    baseUrl: string;
    model: string;
    apiKey: string;
  };
}

export function getConfig(): ServerConfig {
  loadEnv();
  const provider = str('LLM_PROVIDER', 'ollama') === 'openai' ? 'openai' : 'ollama';
  return {
    databaseUrl: str('DATABASE_URL', 'postgres://sage:sage@localhost:5432/semver_sage'),
    embeddingModel: str('EMBEDDING_MODEL', 'Xenova/bge-small-en-v1.5'),
    rerankerModel: str('RERANKER_MODEL', 'Xenova/bge-reranker-base'),
    rerankEnabled: bool('RERANK_ENABLED', true),
    modelCacheDir: resolve(str('MODEL_CACHE_DIR', '.cache/models')),
    repoCacheDir: resolve(str('REPO_CACHE_DIR', '.cache/repos')),
    llm: {
      provider,
      baseUrl: str(
        'LLM_BASE_URL',
        provider === 'ollama' ? 'http://localhost:11434' : 'https://api.groq.com/openai/v1',
      ),
      model: str('LLM_MODEL', provider === 'ollama' ? 'llama3.2:3b' : 'llama-3.1-8b-instant'),
      apiKey: str('LLM_API_KEY', ''),
    },
  };
}
