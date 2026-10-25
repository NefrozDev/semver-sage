import { Injectable, Logger } from '@nestjs/common';
import { AskRequest, AskStreamEvent, FRAMEWORKS } from '@semver-sage/types';
import { buildMessages, createLlmProvider, getConfig, resolveScope } from '@semver-sage/server-core';
import { RetrievalService } from '../retrieval/retrieval.service';

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);
  private readonly llm = createLlmProvider(getConfig());

  constructor(private readonly retrieval: RetrievalService) {}

  get llmName() {
    return this.llm.name;
  }

  async *ask(request: AskRequest, signal: AbortSignal): AsyncIterable<AskStreamEvent> {
    const started = Date.now();
    const indexed = await this.retrieval.indexedVersions();
    if (!indexed.length) {
      yield { type: 'error', message: 'No docs are indexed yet. Run `npm run ingest:vue` first.' };
      return;
    }

    const scope = resolveScope(request, indexed);
    const { versionNum, ...publicScope } = scope;
    yield { type: 'scope', scope: publicScope };

    const citations = await this.retrieval.search(request.question, scope);
    yield { type: 'citations', citations };

    if (!citations.length) {
      const where = scope.framework ? `the ${FRAMEWORKS[scope.framework].label} docs I hold` : 'my scrolls';
      yield { type: 'token', text: `I searched ${where}, but found nothing on this. Try rephrasing, or pick another version.` };
      yield { type: 'done', model: 'none', elapsedMs: Date.now() - started };
      return;
    }

    try {
      for await (const text of this.llm.stream(buildMessages(request.question, scope, citations), signal)) {
        yield { type: 'token', text };
      }
      yield { type: 'done', model: this.llm.name, elapsedMs: Date.now() - started };
    } catch (err) {
      if (signal.aborted) return;
      this.logger.error(`LLM failed: ${(err as Error).message}`);
      yield {
        type: 'error',
        message: `${(err as Error).message}. The sources found are still listed below.`,
      };
    }
  }
}
