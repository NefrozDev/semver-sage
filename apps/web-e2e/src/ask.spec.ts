import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

test.describe('asking a question', () => {
  test('reflects, shows sources, then speaks the answer', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/');

    const box = page.getByRole('textbox', { name: 'Your question' });
    await box.fill('How do I register a global filter in Vue 2?');
    await box.press('Enter');

    // The question becomes the heading; the box clears for a follow-up.
    await expect(page.locator('.question')).toHaveText('How do I register a global filter in Vue 2?');
    await expect(box).toHaveValue('');
    expect(api.requests).toEqual([{ question: 'How do I register a global filter in Vue 2?' }]);

    // Waiting for the answer: reflecting (levitating, eyes glowing), examples gone, Stop instead of Ask.
    const sage = page.locator('app-sage');
    await expect(sage).toHaveClass(/reflecting/);
    await expect(sage.locator('.thoughts')).toBeVisible();
    await expect(sage.locator('.eyes-glow ellipse')).toHaveCount(2);
    await expect(sage.locator('.lift')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -12)');
    await expect(page.locator('.caption')).toHaveText('Reflecting…');
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(page.locator('.examples')).toHaveCount(0);

    api.release();

    // Scope and sources first, then the answer types out in the talking pose.
    await expect(page.locator('.scope .chip')).toHaveText('Vue 2 docs');
    const sources = page.locator('app-citation-list li');
    await expect(sources).toHaveCount(6);
    await expect(sources.first()).toContainText('Vue 2');
    await expect(sage).toHaveClass(/talking/);
    await expect(sage.locator('.palm')).toBeVisible();
    await expect(sage.locator('.spark .star')).toBeVisible();
    // The answer starts with a burst on the crystal; the sage is back on the ground.
    await expect(sage.locator('.burst .rays path')).toHaveCount(12);
    await expect(sage.locator('.burst .shockwave')).toHaveCount(1);
    await expect(sage.locator('.eyes-glow')).toHaveCount(0);
    await expect(sage.locator('.lift')).toHaveCSS('transform', 'none');

    // Finished: idle again, with who answered and how long it took.
    await expect(sage).toHaveClass(/idle/, { timeout: 15_000 });
    await expect(page.locator('app-answer-card footer')).toHaveText('Answered by test/model in 12 s');
    await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible();
  });

  test('citation markers link to their source card', async ({ page }) => {
    await mockApi(page, { hold: false });
    await page.goto('/');
    await page.getByRole('button', { name: 'How do I register a global filter in Vue 2?' }).click();

    const marker = page.locator('app-answer-card a.cite').first();
    await expect(marker).toHaveText('1');
    await expect(marker).toHaveAttribute('href', '#source-1');
    await page.locator('app-answer-card').click(); // skip the typewriter
    await marker.click();
    await expect(page.locator('li#source-1')).toBeInViewport();
    await expect(page.locator('#source-1 a')).toHaveAttribute('href', 'https://v2.vuejs.org/v2/guide/page-1.html');
  });

  test('Stop ends a pending answer', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Your question' }).fill('Since when does Node have fetch?');
    await page.getByRole('button', { name: 'Ask' }).click();

    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible();
    await expect(page.locator('app-sage')).not.toHaveClass(/reflecting/);
  });

  test('shows API errors and the worried sage', async ({ page }) => {
    await mockApi(page, {
      hold: false,
      events: [
        { type: 'scope', scope: { framework: 'vue', requestedVersion: null, version: '3', source: 'latest' } },
        { type: 'citations', citations: [] },
        { type: 'error', message: "Can't reach the LLM" },
      ],
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'How do runes work in Svelte 5?' }).click();

    await expect(page.locator('app-answer-card .error')).toHaveText("Can't reach the LLM");
    await expect(page.locator('app-sage')).toHaveClass(/error/);
    await expect(page.locator('.caption')).toHaveText('Something went wrong');
  });
});
