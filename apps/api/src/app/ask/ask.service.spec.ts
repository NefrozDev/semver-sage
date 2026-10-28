import { Logger } from '@nestjs/common';
import type { ChatMessage, HistoryResult, LlmProvider, SearchScope } from '@semver-sage/server-core';
import { versionToNum, type AskStreamEvent, type Citation, type Framework } from '@semver-sage/types';
import type { RetrievalService } from '../retrieval/retrieval.service';
import { AskService } from './ask.service';

Logger.overrideLogger(false);

const indexed = (framework: Framework, version: string) => ({
  framework,
  version,
  versionNum: versionToNum(version),
  docsBaseUrl: '',
  chunkCount: 1,
  ingestedAt: '',
});

const citation = (version: string, n = 1): Citation => ({
  n,
  framework: 'vue',
  version,
  firstVersion: version,
  lastVersion: version,
  url: `https://v${version}.test/${n}`,
  pageTitle: 'Page',
  section: `Section ${n}`,
  snippet: `Docs text ${version}.${n}`,
});

function fakeRetrieval(
  results: (scope: SearchScope) => Citation[],
  versions = [indexed('vue', '2'), indexed('vue', '3')],
  history: HistoryResult | null = null,
) {
  const searches: { question: string; scope: SearchScope; topK?: number }[] = [];
  const historySearches: { question: string; topics: string[]; scope: SearchScope }[] = [];
  const retrieval = {
    indexedVersions: async () => versions,
    search: async (question: string, scope: SearchScope, topK?: number) => {
      searches.push({ question, scope, topK });
      return results(scope);
    },
    searchHistory: async (question: string, topics: string[], scope: SearchScope) => {
      historySearches.push({ question, topics, scope });
      return history;
    },
  };
  return { retrieval: retrieval as unknown as RetrievalService, searches, historySearches };
}

function fakeLlm(tokens: string[] | Error = ['Use ', 'Vue.filter [1].']) {
  const calls: ChatMessage[][] = [];
  const llm: LlmProvider = {
    name: 'fake/llm',
    async *stream(messages) {
      calls.push(messages);
      if (tokens instanceof Error) throw tokens;
      for (const token of tokens) yield token;
    },
  };
  return { llm, calls };
}

async function collect(service: AskService, question: string, extra: object = {}, signal = new AbortController().signal) {
  const events: AskStreamEvent[] = [];
  for await (const event of service.ask({ question, ...extra }, signal)) events.push(event);
  return events;
}

describe('AskService', () => {
  it('streams scope, citations, the answer and done', async () => {
    const { retrieval, searches } = fakeRetrieval(() => [citation('2', 1), citation('2', 2)]);
    const { llm, calls } = fakeLlm();
    const events = await collect(new AskService(retrieval, llm), 'How do filters work in Vue 2?');

    expect(events.map((e) => e.type)).toEqual(['scope', 'citations', 'token', 'token', 'done']);
    expect(events[0]).toEqual({
      type: 'scope',
      scope: { framework: 'vue', requestedVersion: '2', version: '2', source: 'question' },
    });
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'fake/llm' });
    expect(searches).toEqual([
      { question: 'How do filters work in Vue 2?', scope: expect.objectContaining({ versionNum: 2_000_000 }), topK: undefined },
    ]);
    // The prompt carries the question and the numbered sources.
    expect(calls[0].at(-1)?.content).toContain('[2] Vue 2 docs');
    expect(calls[0].at(-1)?.content).toContain('Question: How do filters work in Vue 2?');
  });

  it('compares two versions: searches each for the topic and numbers sources across both', async () => {
    const { retrieval, searches } = fakeRetrieval((scope) => [citation(scope.version ?? '?', 1), citation(scope.version ?? '?', 2)]);
    const { llm, calls } = fakeLlm(['Changed.']);
    const events = await collect(new AskService(retrieval, llm), 'What changed in v-model between Vue 2 and 3?');

    expect(events[0]).toMatchObject({ type: 'scope', scope: { version: '2' }, compare: { version: '3' } });
    expect(searches.map((s) => [s.question, s.scope.version, s.topK])).toEqual([
      ['v-model', '2', 4],
      ['v-model', '3', 4],
    ]);
    const citations = events[1].type === 'citations' ? events[1].citations : [];
    expect(citations.map((c) => [c.n, c.version])).toEqual([
      [1, '2'],
      [2, '2'],
      [3, '3'],
      [4, '3'],
    ]);
    expect(calls[0][0].content).toContain('what changed between Vue 2 and Vue 3');
  });

  it('answers "since when?" questions from every version: history scope, oldest-first sources', async () => {
    const history: HistoryResult = { citations: [citation('2', 1), citation('3', 2)], earliest: '2', oldest: '2' };
    const { retrieval, searches, historySearches } = fakeRetrieval(() => [citation('3')], undefined, history);
    const { llm, calls } = fakeLlm(['It was a directive.']);
    const events = await collect(new AskService(retrieval, llm), 'When was v-model added to Vue?');

    expect(events.map((e) => e.type)).toEqual(['scope', 'citations', 'token', 'token', 'done']);
    // The verdict is written by the API, so it always matches the search; the LLM adds the details.
    expect(events[2]).toEqual({ type: 'token', text: '**At least since Vue 2**, the oldest docs indexed.\n\n' });
    expect(events[3]).toEqual({ type: 'token', text: 'It was a directive.' });
    expect(events[0]).toEqual({
      type: 'scope',
      scope: { framework: 'vue', requestedVersion: null, version: '3', source: 'latest' },
      history: { earliest: '2', oldest: '2' },
    });
    expect(events[1]).toEqual({ type: 'citations', citations: history.citations });
    expect(historySearches).toEqual([
      {
        question: 'When was v-model added to Vue?',
        topics: ['v-model'],
        scope: expect.objectContaining({ framework: 'vue', versionNum: 3_000_000 }),
      },
    ]);
    // The single-version search is not used.
    expect(searches).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0][0].content).toContain('since which version something exists in Vue');
    expect(calls[0][0].content).toContain('already written: **At least since Vue 2**, the oldest docs indexed.');
  });

  it('lets the LLM answer alone when the history search found no evidence', async () => {
    const history: HistoryResult = { citations: [citation('3', 1)], earliest: null, oldest: '2' };
    const { retrieval } = fakeRetrieval(() => [], undefined, history);
    const events = await collect(new AskService(retrieval, fakeLlm(['Not found.']).llm), 'When was v-model added to Vue?');

    expect(events.map((e) => e.type)).toEqual(['scope', 'citations', 'token', 'done']);
    expect(events[2]).toEqual({ type: 'token', text: 'Not found.' });
  });

  it('falls back to the usual search when the history search has nothing to offer', async () => {
    const { retrieval, searches, historySearches } = fakeRetrieval(() => [citation('3')], undefined, null);
    const { llm, calls } = fakeLlm();
    const events = await collect(new AskService(retrieval, llm), 'When was v-model added to Vue?');

    expect(historySearches).toHaveLength(1);
    expect(searches).toHaveLength(1);
    expect(events[0]).not.toHaveProperty('history');
    expect(calls[0][0].content).toContain('Answer the question for Vue 3');
  });

  it('does not search the history for other questions', async () => {
    const { retrieval, historySearches } = fakeRetrieval(() => [citation('2')]);
    await collect(new AskService(retrieval, fakeLlm().llm), 'How do filters work in Vue 2?');
    expect(historySearches).toEqual([]);
  });

  it('says it found nothing without calling the LLM', async () => {
    const { retrieval } = fakeRetrieval(() => []);
    const { llm, calls } = fakeLlm();
    const events = await collect(new AskService(retrieval, llm), 'Vue 3 quantum entanglement');

    expect(events.map((e) => e.type)).toEqual(['scope', 'citations', 'token', 'done']);
    expect(events[2]).toMatchObject({ text: expect.stringContaining('found nothing') });
    expect(events[3]).toMatchObject({ model: 'none' });
    expect(calls).toEqual([]);
  });

  it('answers AngularJS questions with the fixed notice: no search, no LLM', async () => {
    const { retrieval, searches } = fakeRetrieval(() => [citation('2')]);
    const { llm, calls } = fakeLlm();
    const events = await collect(new AskService(retrieval, llm), 'How do I use $scope in AngularJS?');

    expect(events.map((e) => e.type)).toEqual(['scope', 'citations', 'token', 'done']);
    expect(events[0]).toMatchObject({ scope: { framework: 'angular', version: null, note: expect.stringContaining('separate framework') } });
    expect(events[2]).toMatchObject({ text: expect.stringContaining('Angular 1.x is AngularJS') });
    expect(searches).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('reports an empty index', async () => {
    const { retrieval } = fakeRetrieval(() => [], []);
    const events = await collect(new AskService(retrieval, fakeLlm().llm), 'anything');
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('No docs are indexed') }]);
  });

  it('turns an LLM failure into an error event, keeping the sources', async () => {
    const { retrieval } = fakeRetrieval(() => [citation('2')]);
    const { llm } = fakeLlm(new Error("Can't reach the LLM"));
    const events = await collect(new AskService(retrieval, llm), 'Vue 2 filters');

    expect(events.map((e) => e.type)).toEqual(['scope', 'citations', 'error']);
    expect(events[2]).toMatchObject({ message: expect.stringContaining("Can't reach the LLM") });
  });

  it('ends quietly when the client went away', async () => {
    const controller = new AbortController();
    const { retrieval } = fakeRetrieval(() => [citation('2')]);
    const llm: LlmProvider = {
      name: 'fake',
      // eslint-disable-next-line require-yield
      async *stream() {
        controller.abort();
        throw new Error('aborted');
      },
    };
    const events = await collect(new AskService(retrieval, llm), 'Vue 2 filters', {}, controller.signal);
    expect(events.map((e) => e.type)).toEqual(['scope', 'citations']);
  });
});
