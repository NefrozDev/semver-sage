import { expect, test, type Page } from '@playwright/test';
import { LONG_ANSWER, answerEvents, mockApi } from '../support/mock-api';

/** The sage's animations: how many still play, and the latest any of them ends. */
const sageMotion = (page: Page) =>
  page.evaluate(() => {
    const animations = document.querySelector('app-sage')?.getAnimations({ subtree: true }) ?? [];
    const playing = animations.filter((animation) => animation.playState === 'running');
    return {
      looping: playing.filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity)
        .length,
      latestEnd: Math.max(0, ...playing.map((animation) => Number(animation.effect?.getComputedTiming().endTime))),
    };
  });

test.describe('nothing moves on its own for more than five seconds (2.2.2)', () => {
  test('the idle sage plays its loops once, within five seconds', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.locator('app-sage')).toHaveClass(/idle/, { timeout: 15_000 });

    const motion = await sageMotion(page);
    expect(motion.looping).toBe(0);
    expect(motion.latestEnd).toBeLessThanOrEqual(5000);
  });

  test('a typing answer can be shown whole from the keyboard, which stops the talking', async ({ page }) => {
    await mockApi(page, { hold: false, events: answerEvents({ answer: LONG_ANSWER }) });
    await page.goto('/');
    const box = page.getByRole('textbox', { name: 'Your question' });
    await box.fill('How do I register a global filter in Vue 2?');
    await box.press('Enter');

    const skip = page.getByRole('button', { name: 'Show the whole answer' });
    await skip.focus();
    await page.keyboard.press('Enter');

    await expect(skip).toHaveCount(0);
    await expect(page.locator('app-answer-card .answer')).toHaveText(/v-bind expressions 5\.\s*$/);
    await expect(page.locator('app-sage')).toHaveClass(/idle/);
    // The spark fades out (0.7s) before it leaves, still twinkling meanwhile.
    await expect.poll(async () => (await sageMotion(page)).looping, { timeout: 3000 }).toBe(0);
  });
});
