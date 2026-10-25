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
 * RPG-style dialog box. Reveals `text` with a typewriter effect as it streams in;
 * clicking the box skips to the end.
 */
@Component({
  selector: 'app-dialog-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'skip()', '[class.thinking]': 'thinking()' },
  template: `
    <div class="nameplate">{{ speaker() }}</div>
    <div class="body" aria-live="polite">
      @if (thinking() && !text()) {
        <p class="thinking-text">Consulting the scrolls<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>
      } @else {
        <div class="answer" [innerHTML]="html()"></div>
      }
      <ng-content />
    </div>
    @if (!typing() && !thinking() && text()) {
      <span class="next" aria-hidden="true">▼</span>
    }
  `,
  styleUrl: './dialog-box.scss',
})
export class DialogBox {
  readonly text = input('');
  readonly speaker = input('Sage');
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
