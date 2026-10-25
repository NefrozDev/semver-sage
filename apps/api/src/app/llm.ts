import type { Provider } from '@nestjs/common';
import { createLlmProvider, getConfig } from '@semver-sage/server-core';

/** Injection token for the LlmProvider (Ollama or OpenAI-compatible, from config; a fake in tests). */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export const llmProvider: Provider = {
  provide: LLM_PROVIDER,
  useFactory: () => createLlmProvider(getConfig()),
};
