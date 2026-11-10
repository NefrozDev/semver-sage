import { TestBed } from '@angular/core/testing';
import { AnswerCard } from './answer-card';

describe('AnswerCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function render(inputs: { text?: string; thinking?: boolean } = {}) {
    const fixture = TestBed.createComponent(AnswerCard);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    const typing: boolean[] = [];
    fixture.componentInstance.typingChange.subscribe((value) => typing.push(value));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const body = () => el.querySelector('.body') as HTMLElement;
    const skip = () => el.querySelector<HTMLButtonElement>('button.skip');
    return { fixture, el, body, skip, typing };
  }

  it('names the search for screen readers with hidden text, not a label on a bare div', async () => {
    const { el, body } = await render({ thinking: true });

    const reflecting = el.querySelector('.reflecting') as HTMLElement;
    expect(reflecting.hasAttribute('aria-label')).toBe(false);
    expect(reflecting.querySelector('.sr-only')?.textContent).toBe('Searching the docs');
    expect(reflecting.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(3);
    // Busy while searching: screen readers wait for the answer.
    expect(body().getAttribute('aria-live')).toBe('polite');
    expect(body().getAttribute('aria-busy')).toBe('true');
  });

  it('types the answer out, busy and with a button to show it whole, then announces it once', async () => {
    const { fixture, el, body, skip, typing } = await render({ text: 'A short answer.' });

    expect(body().getAttribute('aria-busy')).toBe('true');
    expect(skip()?.textContent?.trim()).toBe('Show the whole answer');
    expect(el.querySelector('.answer')?.textContent?.trim()).toBe('');

    vi.advanceTimersByTime(40 * 8);
    fixture.detectChanges();

    expect(el.querySelector('.answer')?.textContent?.trim()).toBe('A short answer.');
    expect(body().getAttribute('aria-busy')).toBe('false');
    expect(skip()).toBeNull();
    expect(typing).toEqual([true, false]);
  });

  it('shows the whole answer at once from its button, which the keyboard reaches', async () => {
    const { fixture, el, body, skip, typing } = await render({ text: 'A longer answer that would take a while to type.' });

    skip()?.click();
    fixture.detectChanges();

    expect(el.querySelector('.answer')?.textContent?.trim()).toBe('A longer answer that would take a while to type.');
    expect(body().getAttribute('aria-busy')).toBe('false');
    expect(skip()).toBeNull();
    expect(typing).toEqual([true, false]);
  });

  it('still shows it whole on a click anywhere on the card', async () => {
    const { fixture, el, skip } = await render({ text: 'Clicked through.' });

    el.click();
    fixture.detectChanges();

    expect(el.querySelector('.answer')?.textContent?.trim()).toBe('Clicked through.');
    expect(skip()).toBeNull();
  });

  it('is not busy and offers no skip with nothing to type', async () => {
    const { body, skip } = await render();

    expect(body().getAttribute('aria-busy')).toBe('false');
    expect(skip()).toBeNull();
  });
});
