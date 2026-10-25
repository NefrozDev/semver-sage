import { createLlmProvider, OllamaProvider, OpenAiCompatibleProvider } from './llm.provider';

/** A streamed response body delivered in the given chunks (deliberately cut mid-line). */
const streamed = (chunks: string[], status = 200) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    { status },
  );

async function collect(iterable: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const token of iterable) out.push(token);
  return out;
}

const signal = new AbortController().signal;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('OllamaProvider', () => {
  it('parses newline-delimited JSON split across chunks', async () => {
    fetchMock.mockResolvedValue(
      streamed(['{"message":{"content":"Use "}}\n{"mess', 'age":{"content":"Vue.filter"}}\n{"done":true}']),
    );
    const llm = new OllamaProvider('http://ollama:11434/', 'llama3.2:3b');

    expect(await collect(llm.stream([{ role: 'user', content: 'q' }], signal))).toEqual(['Use ', 'Vue.filter']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama:11434/api/chat');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'llama3.2:3b', stream: true });
    expect(llm.name).toBe('ollama/llama3.2:3b');
  });

  it('raises errors reported inside the stream', async () => {
    fetchMock.mockResolvedValue(streamed(['{"error":"model not found"}\n']));
    await expect(collect(new OllamaProvider('http://x', 'm').stream([], signal))).rejects.toThrow('model not found');
  });

  it('explains an unreachable server', async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    await expect(collect(new OllamaProvider('http://x', 'm').stream([], signal))).rejects.toThrow(
      "Can't reach the LLM at http://x/api/chat (ECONNREFUSED)",
    );
  });

  it('reports HTTP errors with their status', async () => {
    fetchMock.mockResolvedValue(new Response('no such model', { status: 404 }));
    await expect(collect(new OllamaProvider('http://x', 'm').stream([], signal))).rejects.toThrow(
      'LLM request failed: 404 no such model',
    );
  });
});

describe('OpenAiCompatibleProvider', () => {
  it('parses SSE deltas split across chunks and stops at [DONE]', async () => {
    fetchMock.mockResolvedValue(
      streamed([
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"choices":[{"delta":{"content":"Hel',
        'lo"}}]}\n\n: keep-alive\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n',
        'data: {"choices":[{"delta":{"content":"ignored"}}]}\n\n',
      ]),
    );
    const llm = new OpenAiCompatibleProvider('https://api.example/v1', 'gpt', 'secret');

    expect(await collect(llm.stream([{ role: 'user', content: 'q' }], signal))).toEqual(['Hello', ' world']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' });
  });

  it('sends no Authorization header without a key', async () => {
    fetchMock.mockResolvedValue(streamed(['data: [DONE]\n\n']));
    await collect(new OpenAiCompatibleProvider('http://localhost:1234/v1', 'local', '').stream([], signal));
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
});

describe('createLlmProvider', () => {
  const config = (provider: 'ollama' | 'openai') =>
    ({ llm: { provider, baseUrl: 'http://x', model: 'm', apiKey: 'k' } }) as Parameters<typeof createLlmProvider>[0];

  it('picks the provider from config', () => {
    expect(createLlmProvider(config('ollama'))).toBeInstanceOf(OllamaProvider);
    expect(createLlmProvider(config('openai'))).toBeInstanceOf(OpenAiCompatibleProvider);
  });
});
