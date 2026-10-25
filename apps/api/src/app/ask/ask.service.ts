import { Injectable, Logger } from '@nestjs/common';
import {
  buildCompareMessages,
  buildMessages,
  ChatMessage,
  createLlmProvider,
  getConfig,
  resolveComparison,
  resolveScope,
  SearchScope,
} from '@semver-sage/server-core';
import {
  AskRequest,
  AskStreamEvent,
  Citation,
  comparisonTopic,
  FRAMEWORKS,
  ResolvedScope,
} from '@semver-sage/types';
import { RetrievalService } from '../retrieval/retrieval.service';

/** Sources per version in compare mode (two versions share the usual budget of ~8). */
const COMPARE_TOP_K = 4;

const toPublic = ({ versionNum, ...scope }: SearchScope): ResolvedScope => scope;

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

    let scope: SearchScope;
    let citations: Citation[];
    let messages: ChatMessage[];
    const comparison = resolveComparison(request, indexed);

    if (comparison) {
      const [from, to] = comparison;
      scope = from;
      yield { type: 'scope', scope: toPublic(from), compare: toPublic(to) };
      // Search for the subject ("v-model"), not the comparison wording, which drags in migration pages.
      const topic = comparisonTopic(request.question);
      const [before, after] = await Promise.all([
        this.retrieval.search(topic, from, COMPARE_TOP_K),
        this.retrieval.search(topic, to, COMPARE_TOP_K),
      ]);
      citations = [...before, ...after].map((c, i) => ({ ...c, n: i + 1 }));
      messages = buildCompareMessages(request.question, from, to, citations);
    } else {
      scope = resolveScope(request, indexed);
      yield { type: 'scope', scope: toPublic(scope) };
      citations = await this.retrieval.search(request.question, scope);
      messages = buildMessages(request.question, scope, citations);
    }
    yield { type: 'citations', citations };

    if (!citations.length) {
      const where = scope.framework ? `the ${FRAMEWORKS[scope.framework].label} docs I hold` : 'my scrolls';
      yield { type: 'token', text: `I searched ${where}, but found nothing on this. Try rephrasing, or pick another version.` };
      yield { type: 'done', model: 'none', elapsedMs: Date.now() - started };
      return;
    }

    try {
      for await (const text of this.llm.stream(messages, signal)) {
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
