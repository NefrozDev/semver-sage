import type { ServerConfig } from '@semver-sage/server-core';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Streams a chat completion as text deltas. Swap implementations to change LLM backends. */
export interface LlmProvider {
  readonly name: string;
  stream(messages: ChatMessage[], signal: AbortSignal): AsyncIterable<string>;
}

async function* lines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

async function post(url: string, body: unknown, signal: AbortSignal, headers: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    const cause = (err as { cause?: { code?: string } }).cause;
    throw new Error(`Can't reach the LLM at ${url} (${cause?.code ?? String(cause ?? err)})`);
  }
  if (!res.ok || !res.body) {
    throw new Error(`LLM request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return res.body;
}

/** Local Ollama (`/api/chat`, newline-delimited JSON stream). */
export class OllamaProvider implements LlmProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  get name() {
    return `ollama/${this.model}`;
  }

  async *stream(messages: ChatMessage[], signal: AbortSignal) {
    const body = await post(
      `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      { model: this.model, messages, stream: true, options: { temperature: 0.2 } },
      signal,
    );
    for await (const line of lines(body)) {
      const event = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (event.error) throw new Error(event.error);
      if (event.message?.content) yield event.message.content;
    }
  }
}

/** Any OpenAI-compatible `/chat/completions` endpoint (Groq, OpenRouter, LM Studio, BYO key...). */
export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string,
  ) {}

  get name() {
    return `openai-compatible/${this.model}`;
  }

  async *stream(messages: ChatMessage[], signal: AbortSignal) {
    const body = await post(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      { model: this.model, messages, stream: true, temperature: 0.2 },
      signal,
      this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
    );
    for await (const line of lines(body)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      const delta = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] })
        .choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

export function createLlmProvider({ llm }: ServerConfig): LlmProvider {
  return llm.provider === 'openai'
    ? new OpenAiCompatibleProvider(llm.baseUrl, llm.model, llm.apiKey)
    : new OllamaProvider(llm.baseUrl, llm.model);
}
