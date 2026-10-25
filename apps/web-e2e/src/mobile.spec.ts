import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

// Runs in the "mobile" project (Pixel 7 viewport).
test.describe('phone layout', () => {
  test('fits the screen and keeps the examples above the question box', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBe(0);

    const examples = page.locator('.examples');
    const box = page.getByRole('textbox', { name: 'Your question' });
    await examples.scrollIntoViewIfNeeded();
    await expect(examples).toBeInViewport();
    const [examplesBox, composerBox] = await Promise.all([examples.boundingBox(), box.boundingBox()]);
    if (!examplesBox || !composerBox) throw new Error('examples or question box not rendered');
    expect(examplesBox.y + examplesBox.height).toBeLessThanOrEqual(composerBox.y);

    // The known-versions list is hidden to keep the sage panel compact.
    await expect(page.locator('.indexed')).toBeHidden();
  });

  test('keeps the question box in reach once there is an answer', async ({ page }) => {
    await mockApi(page, { hold: false });
    await page.goto('/');
    await page.getByRole('button', { name: 'How do I register a global filter in Vue 2?' }).click();

    await expect(page.locator('app-citation-list li')).toHaveCount(6);
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeInViewport();
  });
});
