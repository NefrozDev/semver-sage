import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { renderAnswer } from '../markdown';

const TICK_MS = 24;

/**
 * The sage's answer. Reveals `text` with a typewriter effect as it streams in;
 * clicking the card skips to the end.
 */
@Component({
  selector: 'app-answer-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'skip()', '[class.thinking]': 'thinking()' },
  template: `
    <header>
      <span class="avatar" aria-hidden="true"></span>
      <span class="speaker">{{ speaker() }}</span>
      @if (status(); as status) {
        <span class="status">{{ status }}</span>
      }
    </header>
    <div class="body" aria-live="polite">
      @if (thinking() && !text()) {
        <div class="reflecting" aria-label="Searching the docs">
          <span></span><span></span><span></span>
        </div>
      } @else {
        <div class="answer" [class.typing]="typing()" [innerHTML]="html()"></div>
      }
      <ng-content />
    </div>
  `,
  styleUrl: './answer-card.scss',
})
export class AnswerCard {
  readonly text = input('');
  readonly speaker = input('Sage');
  readonly status = input<string | null>(null);
  readonly thinking = input(false);
  readonly typingChange = output<boolean>();

  private readonly shown = signal(0);
  protected readonly typing = computed(() => this.shown() < this.text().length);
  protected readonly html = computed(() => renderAnswer(this.text().slice(0, this.shown())));

  constructor() {
    // A new, shorter text means a new answer: start typing from the beginning.
    effect(() => {
      if (this.text().length < this.shown()) this.shown.set(0);
    });
    effect(() => this.typingChange.emit(this.typing()));

    const timer = setInterval(() => {
      const remaining = this.text().length - this.shown();
      if (remaining > 0) this.shown.update((n) => n + Math.max(1, Math.ceil(remaining / 30)));
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected skip(): void {
    this.shown.set(this.text().length);
  }
}
