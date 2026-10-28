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

const TICK_MS = 40;
/** About 50 characters a second: a pace one can read along with. */
const CHARS_PER_TICK = 2;
/** Beyond this backlog (a long answer arriving at once), speed up to catch up. */
const CATCH_UP_AFTER = 200;

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
    @if (meta(); as meta) {
      <footer>{{ meta }}</footer>
    }
  `,
  styleUrl: './answer-card.scss',
})
export class AnswerCard {
  readonly text = input('');
  readonly speaker = input('Sage');
  readonly status = input<string | null>(null);
  /** Small print under the answer, e.g. which model answered and how long it took. */
  readonly meta = input<string | null>(null);
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
      if (remaining <= 0) return;
      const step = remaining > CATCH_UP_AFTER ? Math.ceil(remaining / 100) : CHARS_PER_TICK;
      this.shown.update((n) => Math.min(this.text().length, n + step));
    }, TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected skip(): void {
    this.shown.set(this.text().length);
  }
}
