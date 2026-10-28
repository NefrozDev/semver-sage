import { expect, Page, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

test.describe('landing', () => {
  test('greets, offers examples and lists the indexed versions', async ({ page }) => {
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Semver Sage' })).toBeVisible();
    // The greeting comes after the sage's wave.
    await page.clock.runFor(5_000);
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
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');

    // Wave, then the whole greeting typed out.
    await page.clock.runFor(10_000);
    await expect(page.locator('app-answer-card')).toContainText('exactly what you have installed.');
    await expect(page.locator('app-sage')).toHaveClass(/idle/);
    await expect(page.locator('.caption')).toHaveText('Ready when you are');
  });

  // A fake clock lets the tests skip ahead instead of waiting. "Not waving" is read once, right
  // away: a retrying `not.toHaveClass` would just wait for a wave to end.
  const isWaving = async (page: Page) => /\bsaluting\b/.test((await page.locator('app-sage').getAttribute('class')) ?? '');

  test('the sage waves hello half a second after the page opens, then speaks the greeting', async ({ page }) => {
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');
    const sage = page.locator('app-sage');
    const card = page.locator('app-answer-card');
    const raisedArm = sage.locator('.free-arm .sleeve[d="M90 150 Q74 148 64 134"]');

    // Quiet until he waves: no greeting yet, not talking.
    await expect(sage).toHaveClass(/saluting/);
    expect(await page.evaluate(() => performance.now())).toBeGreaterThanOrEqual(500);
    await expect(sage).toHaveClass(/idle/);
    await expect(card).not.toContainText('Greetings');
    // The raised arm, with an open palm, replaces the hanging one.
    await expect(raisedArm).toHaveCount(1);
    await expect(sage.locator('.free-arm .palm')).toBeVisible();

    // The arm comes back down, and only then does he speak.
    await page.clock.runFor(2_700);
    expect(await isWaving(page)).toBe(false);
    await expect(raisedArm).toHaveCount(0);
    await expect(card).toContainText('Greetings, traveler');
    await expect(sage).toHaveClass(/talking/);
    await expect(sage.locator('.burst .rays path')).toHaveCount(12);

    // Once only.
    await page.clock.runFor(8_000);
    expect(await isWaving(page)).toBe(false);
  });

  test('no wave once a question is on its way', async ({ page }) => {
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Your question' }).fill('How do filters work in Vue 2?');
    await page.getByRole('button', { name: 'Ask' }).click();

    await page.clock.runFor(3_000);
    await expect(page.locator('app-sage')).toHaveClass(/reflecting/);
    expect(await isWaving(page)).toBe(false);
  });

  test('without motion, the sage does not wave and greets at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');

    await page.clock.runFor(500);
    await expect(page.locator('app-answer-card')).toContainText('Greetings, traveler');
    await page.clock.runFor(3_000);
    expect(await isWaving(page)).toBe(false);
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
