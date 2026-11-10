import { expect, test } from '@playwright/test';
import { openScreen, screens } from '../support/screens';

// 320 CSS pixels: a 1280px window zoomed to 400%, what WCAG 1.4.10 (Reflow) asks to support.
test.use({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });

test.describe('every screen reflows to 320px without scrolling sideways (1.4.10)', () => {
  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);

      const widths = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    });
  }
});

test.describe('every screen keeps its text whole with WCAG text spacing (1.4.12)', () => {
  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);
      // The spacing a reader may impose: line height, letter, word and paragraph spacing.
      await page.addStyleTag({
        content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
          word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`,
      });

      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => {
            const style = getComputedStyle(element);
            // Each axis on its own: a row that scrolls sideways loses nothing, even if it clips height.
            const clips = (o: string) => o === 'hidden' || o === 'clip';
            // Visually hidden text and names cut with an ellipsis on purpose are not clipped text.
            const meant =
              // Collapsed parts, hidden from assistive tech until opened, are not lost text either.
              !!element.closest('[aria-hidden="true"], [inert], [hidden]') ||
              element.clientWidth <= 1 ||
              style.clip === 'rect(0px, 0px, 0px, 0px)' ||
              style.textOverflow === 'ellipsis';
            return (
              !meant &&
              (element.textContent ?? '').trim() !== '' &&
              ((clips(style.overflowY) && element.scrollHeight > element.clientHeight + 1) ||
                (clips(style.overflowX) && element.scrollWidth > element.clientWidth + 1))
            );
          })
          .map(
            (element) =>
              `${element.getAttribute('class')}: ${(element.textContent ?? '').trim().slice(0, 40)}`,
          ),
      );
      expect(clipped).toEqual([]);
      const widths = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    });
  }
});
