import { Injectable, signal } from '@angular/core';
import type { AskRequest, AskStreamEvent, Citation, ResolvedScope } from '@semver-sage/types';

export type SageStatus = 'idle' | 'thinking' | 'speaking' | 'done' | 'error';

/** Holds the current question's state and streams answers from `POST /api/ask` (SSE). */
@Injectable({ providedIn: 'root' })
export class SageStore {
  readonly status = signal<SageStatus>('idle');
  readonly question = signal('');
  readonly scope = signal<ResolvedScope | null>(null);
  readonly citations = signal<Citation[]>([]);
  readonly answer = signal('');
  readonly error = signal<string | null>(null);
  readonly model = signal<string | null>(null);

  private controller?: AbortController;

  async ask(request: AskRequest): Promise<void> {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.question.set(request.question);
    this.scope.set(null);
    this.citations.set([]);
    this.answer.set('');
    this.error.set(null);
    this.model.set(null);
    this.status.set('thinking');

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const data = buffer
            .slice(0, end)
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          buffer = buffer.slice(end + 2);
          if (data) this.handle(JSON.parse(data) as AskStreamEvent);
        }
      }
      if (this.status() === 'thinking' || this.status() === 'speaking') this.status.set('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      this.fail((err as Error).message || "The sage couldn't be reached.");
    }
  }

  stop(): void {
    this.controller?.abort();
    if (this.status() === 'thinking' || this.status() === 'speaking') this.status.set('done');
  }

  private handle(event: AskStreamEvent): void {
    switch (event.type) {
      case 'scope':
        this.scope.set(event.scope);
        break;
      case 'citations':
        this.citations.set(event.citations);
        break;
      case 'token':
        this.status.set('speaking');
        this.answer.update((text) => text + event.text);
        break;
      case 'done':
        this.model.set(event.model);
        this.status.set('done');
        break;
      case 'error':
        this.fail(event.message);
        break;
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    this.status.set('error');
  }
}
