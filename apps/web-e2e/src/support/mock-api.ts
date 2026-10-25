import type { Page } from '@playwright/test';
import type { AskRequest, AskStreamEvent, Citation, IndexedVersion } from '@semver-sage/types';

const indexed = (framework: IndexedVersion['framework'], versions: string[]): IndexedVersion[] =>
  versions.map((version) => ({ framework, version, docsBaseUrl: '', chunkCount: 100, ingestedAt: '' }));

export const VERSIONS: IndexedVersion[] = [
  ...indexed('vue', ['2', '3']),
  ...indexed('angular', ['2', '4', '12', '17', '22']),
  ...indexed('node', ['14', '18', '22']),
];

export const citations = (version = '2', count = 6): Citation[] =>
  Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    framework: 'vue',
    version,
    firstVersion: version,
    lastVersion: version,
    url: `https://v2.vuejs.org/v2/guide/page-${i + 1}.html`,
    pageTitle: `Page ${i + 1}`,
    section: `Section ${i + 1}`,
    snippet: 'Some docs text.',
  }));

/** Long enough that the typewriter (and the talking pose) lasts a few seconds. */
export const LONG_ANSWER =
  'Register a global filter with `Vue.filter()` before creating the root instance [1]. ' +
  'Filters are usable in mustache interpolations and v-bind expressions [5]. '.repeat(12);

export const answerEvents = (overrides: Partial<{ answer: string; citations: Citation[] }> = {}): AskStreamEvent[] => [
  {
    type: 'scope',
    scope: { framework: 'vue', requestedVersion: '2', version: '2', source: 'question' },
  },
  { type: 'citations', citations: overrides.citations ?? citations() },
  { type: 'token', text: overrides.answer ?? LONG_ANSWER },
  { type: 'done', model: 'test/model', elapsedMs: 12_400 },
];

const sse = (events: AskStreamEvent[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

export interface MockApi {
  /** Bodies of every POST /api/ask, in order. */
  requests: AskRequest[];
  /** Lets the pending /api/ask respond; until then the sage stays in his reflecting pose. */
  release(): void;
}

/**
 * Mocks the API in the browser. /api/ask waits for `release()` unless `hold` is false, then
 * answers with `events` (or whatever `respond` returns for the request).
 */
export async function mockApi(
  page: Page,
  options: {
    events?: AskStreamEvent[];
    respond?: (request: AskRequest) => AskStreamEvent[];
    hold?: boolean;
    versions?: IndexedVersion[] | 'error';
  } = {},
): Promise<MockApi> {
  const requests: AskRequest[] = [];
  let release = () => undefined as void;
  let gate = options.hold === false ? Promise.resolve() : new Promise<void>((r) => (release = r));

  await page.route('**/api/versions', (route) =>
    options.versions === 'error'
      ? route.fulfill({ status: 502, body: 'Bad Gateway' })
      : route.fulfill({ json: options.versions ?? VERSIONS }),
  );
  await page.route('**/api/ask', async (route) => {
    const request = route.request().postDataJSON() as AskRequest;
    requests.push(request);
    await gate;
    gate = Promise.resolve();
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sse(options.respond?.(request) ?? options.events ?? answerEvents()),
    });
  });

  return { requests, release: () => release() };
}
