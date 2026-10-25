import { TestBed } from '@angular/core/testing';
import type { AskStreamEvent } from '@semver-sage/types';
import { SageStore } from './sage.store';

const sse = (events: AskStreamEvent[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

/** A streamed response that delivers `body` in pieces of `size` characters (cutting events apart). */
function streamed(body: string, size: number, status = 200) {
  const pieces = body.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [];
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of pieces) controller.enqueue(new TextEncoder().encode(piece));
        controller.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const events: AskStreamEvent[] = [
  { type: 'scope', scope: { framework: 'vue', requestedVersion: '2', version: '2', source: 'question' } },
  {
    type: 'citations',
    citations: [
      {
        n: 1,
        framework: 'vue',
        version: '2',
        firstVersion: '2',
        lastVersion: '2',
        url: 'https://v2.vuejs.org/x',
        pageTitle: 'Filters',
        section: 'Usage',
        snippet: 'text',
      },
    ],
  },
  { type: 'token', text: 'Use ' },
  { type: 'token', text: 'Vue.filter [1].' },
  { type: 'done', model: 'test/model', elapsedMs: 1234 },
];

describe('SageStore', () => {
  let store: SageStore;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    store = TestBed.inject(SageStore);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([1, 7, 64, 10_000])('reads the event stream however it is chunked (%i chars)', async (size) => {
    fetchMock.mockResolvedValue(streamed(sse(events), size));
    await store.ask({ question: 'Vue 2 filters?' });

    expect(store.scope()).toMatchObject({ framework: 'vue', version: '2' });
    expect(store.citations()).toHaveLength(1);
    expect(store.answer()).toBe('Use Vue.filter [1].');
    expect(store.model()).toBe('test/model');
    expect(store.elapsedMs()).toBe(1234);
    expect(store.status()).toBe('done');
    expect(store.error()).toBeNull();
  });

  it('posts the request as JSON', async () => {
    fetchMock.mockResolvedValue(streamed(sse(events), 100));
    await store.ask({ question: 'q', framework: 'vue', version: '2' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ask');
    expect(JSON.parse(init.body)).toEqual({ question: 'q', framework: 'vue', version: '2' });
  });

  it('shows API validation errors', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'invalid version: banana' }), { status: 400 }));
    await store.ask({ question: 'q', framework: 'vue', version: 'banana' });

    expect(store.status()).toBe('error');
    expect(store.error()).toBe('invalid version: banana');
  });

  it('shows errors sent in the stream, keeping the sources', async () => {
    fetchMock.mockResolvedValue(streamed(sse([events[0], events[1], { type: 'error', message: 'LLM down' }]), 50));
    await store.ask({ question: 'q' });

    expect(store.status()).toBe('error');
    expect(store.error()).toBe('LLM down');
    expect(store.citations()).toHaveLength(1);
  });

  it('reports an unreachable API', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await store.ask({ question: 'q' });
    expect(store.error()).toBe('Failed to fetch');
  });

  it('a new question resets the previous answer', async () => {
    fetchMock.mockResolvedValue(streamed(sse(events), 100));
    await store.ask({ question: 'first' });
    fetchMock.mockResolvedValue(streamed(sse([events[0], { type: 'citations', citations: [] }]), 100));
    await store.ask({ question: 'second' });

    expect(store.question()).toBe('second');
    expect(store.answer()).toBe('');
    expect(store.citations()).toEqual([]);
    expect(store.model()).toBeNull();
  });

  it('stop() aborts the request without reporting an error', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const pending = store.ask({ question: 'q' });
    expect(store.status()).toBe('thinking');

    store.stop();
    await pending;
    expect(store.status()).toBe('done');
    expect(store.error()).toBeNull();
  });
});
