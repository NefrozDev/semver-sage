import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

test.describe('landing', () => {
  test('greets, offers examples and lists the indexed versions', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Semver Sage' })).toBeVisible();
    await expect(page.locator('app-answer-card')).toContainText('Greetings, traveler');
    await expect(page.getByRole('button', { name: 'How do runes work in Svelte 5?' })).toBeVisible();

    const indexed = page.locator('.indexed li');
    await expect(indexed.filter({ hasText: 'Angular' })).toContainText('2–22');
    await expect(indexed.filter({ hasText: 'Vue' })).toContainText('2, 3');

    // No question asked yet: no question heading, no sources.
    await expect(page.locator('.question')).toHaveCount(0);
    await expect(page.locator('app-citation-list')).toHaveCount(0);
  });

  test('the sage finishes his greeting and waits idle', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    // (He talks while the greeting types; that transient pose is covered by the ask flow.)
    await expect(page.locator('app-sage')).toHaveClass(/idle/, { timeout: 10_000 });
    await expect(page.locator('.caption')).toHaveText('Ready when you are');
    await expect(page.locator('app-answer-card')).toContainText('exactly what you have installed.');
  });

  test('says so when the API is unreachable', async ({ page }) => {
    await mockApi(page, { versions: 'error' });
    await page.goto('/');

    await expect(page.getByText('API unreachable. Is it running?')).toBeVisible();
  });
});

test.describe('dark theme', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the system color scheme', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(15, 15, 26)');
  });
});
