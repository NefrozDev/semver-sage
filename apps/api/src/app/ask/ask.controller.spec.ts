import { BadRequestException } from '@nestjs/common';
import type { AskRequest, AskStreamEvent } from '@semver-sage/types';
import type { Response } from 'express';
import { EventEmitter } from 'node:events';
import type { DatabaseService } from '../database.service';
import type { RetrievalService } from '../retrieval/retrieval.service';
import { AskController, HEARTBEAT_MS, validate } from './ask.controller';
import type { AskService } from './ask.service';

describe('validate (POST /api/ask body)', () => {
  it('accepts a question, trims it and drops empty scope fields', () => {
    expect(validate({ question: '  filters?  ', framework: null, version: null })).toEqual({
      question: 'filters?',
      framework: undefined,
      version: undefined,
      compareVersion: undefined,
    });
  });

  it('keeps a full scope', () => {
    expect(validate({ question: 'q', framework: 'vue', version: '2.6', compareVersion: '3' })).toMatchObject({
      framework: 'vue',
      version: '2.6',
      compareVersion: '3',
    });
  });

  it.each([
    [undefined, 'question must be'],
    [{ question: '   ' }, 'question must be'],
    [{ question: 'x'.repeat(1001) }, 'question must be'],
    [{ question: 42 }, 'question must be'],
    [{ question: 'q', framework: 'cobol' }, 'unknown framework'],
    [{ question: 'q', framework: 'vue', version: 'latest' }, 'invalid version'],
    [{ question: 'q', framework: 'vue', version: 3 }, 'invalid version'],
    [{ question: 'q', framework: 'vue', version: `${' '.repeat(40)}2` }, 'invalid version'],
    [{ question: 'q', framework: 'vue', compareVersion: 'x' }, 'invalid compareVersion'],
    [{ question: 'q', compareVersion: '3' }, 'compareVersion needs a framework'],
  ])('rejects %j', (body, message) => {
    expect(() => validate(body)).toThrow(BadRequestException);
    expect(() => validate(body)).toThrow(message);
  });
});

describe('AskController.ask (SSE stream)', () => {
  const PING = ': ping\n\n';
  const scope: AskStreamEvent = {
    type: 'scope',
    scope: { framework: 'react', requestedVersion: '16', version: '16.14', source: 'question' },
  };
  const token: AskStreamEvent = { type: 'token', text: 'Use React.memo [1].' };
  const done: AskStreamEvent = { type: 'done', model: 'test/model', elapsedMs: 1 };
  const data = (event: AskStreamEvent) => `data: ${JSON.stringify(event)}\n\n`;

  type AskFn = (request: AskRequest, signal: AbortSignal) => AsyncIterable<AskStreamEvent>;

  function fakeResponse() {
    return Object.assign(new EventEmitter(), {
      writeHead: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn<(chunk: string) => boolean>(() => true),
      end: vi.fn(),
    });
  }
  const writes = (res: ReturnType<typeof fakeResponse>) => res.write.mock.calls.map(([chunk]) => chunk);

  function run(ask: AskFn, body: unknown = { question: 'memo in React 16?' }) {
    const askService = { ask: vi.fn(ask), llmName: 'test/model' };
    const controller = new AskController(
      askService as unknown as AskService,
      {} as RetrievalService,
      {} as DatabaseService,
    );
    const res = fakeResponse();
    return { askService, res, finished: controller.ask(body, res as unknown as Response) };
  }

  /** An LLM that stays silent until released, or until the request is aborted. */
  function slowLlm() {
    let release!: () => void;
    const firstToken = new Promise<void>((resolve) => (release = resolve));
    const ask: AskFn = async function* (_request, signal) {
      yield scope;
      await Promise.race([
        firstToken,
        new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
      ]);
      yield token;
      yield done;
    };
    return { ask, release: () => release() };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens an unbuffered event stream and passes the validated request with an abort signal', async () => {
    const { askService, res, finished } = run(async function* () {
      yield done;
    }, { question: '  memo?  ', framework: 'react' });
    await finished;

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' }),
    );
    expect(res.flushHeaders).toHaveBeenCalledOnce();
    expect(askService.ask).toHaveBeenCalledOnce();
    expect(askService.ask).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'memo?', framework: 'react' }),
      expect.any(AbortSignal),
    );
    expect(writes(res)).toEqual([data(done)]);
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('pings every 15 s while the LLM is silent, so proxies keep the stream open, and stops at the end', async () => {
    const llm = slowLlm();
    const { res, finished } = run(llm.ask);

    // nginx drops a silent upstream after 60 s: 4 pings fit in that minute.
    await vi.advanceTimersByTimeAsync(4 * HEARTBEAT_MS);
    expect(writes(res)).toEqual([data(scope), PING, PING, PING, PING]);

    llm.release();
    await finished;
    expect(writes(res)).toEqual([data(scope), PING, PING, PING, PING, data(token), data(done)]);
    expect(res.end).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(4 * HEARTBEAT_MS);
    expect(res.write).toHaveBeenCalledTimes(7);
  });

  it('stops pinging and aborts the LLM call when the client disconnects, without writing an error', async () => {
    const llm = slowLlm();
    const { askService, res, finished } = run(llm.ask);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);

    res.emit('close');
    await finished;

    const signal = askService.ask.mock.calls[0][1];
    expect(signal.aborted).toBe(true);
    expect(writes(res)).toEqual([data(scope), PING]);
    await vi.advanceTimersByTimeAsync(4 * HEARTBEAT_MS);
    expect(res.write).toHaveBeenCalledTimes(2);
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('turns a failure into an error event and stops pinging', async () => {
    const { res, finished } = run(async function* () {
      yield scope;
      throw new Error("Can't reach the LLM at http://ollama:11434/api/chat (ECONNREFUSED)");
    });
    await finished;

    expect(writes(res)).toEqual([
      data(scope),
      data({ type: 'error', message: "Can't reach the LLM at http://ollama:11434/api/chat (ECONNREFUSED)" }),
    ]);
    expect(res.end).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(4 * HEARTBEAT_MS);
    expect(res.write).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid body before opening the stream or asking anything', () => {
    const { askService, res, finished } = run(async function* () {
      yield done;
    }, { question: '' });

    return expect(finished).rejects.toThrow(BadRequestException).then(() => {
      expect(res.writeHead).not.toHaveBeenCalled();
      expect(askService.ask).not.toHaveBeenCalled();
    });
  });
});
