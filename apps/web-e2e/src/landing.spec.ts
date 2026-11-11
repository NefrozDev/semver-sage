import { expect, Page, test } from '@playwright/test';
import { FRAMEWORK_IDS } from '@semver-sage/types';
import { ACCOUNT_URL, mockApi } from './support/mock-api';

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

  test('offers to sign in with the Synapse account, without requiring it', async ({ page }) => {
    await mockApi(page);
    await page.goto('/?q=1');

    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnTo=%2F%3Fq%3D1',
    );
    await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible();
  });

  test('shows who is signed in, with their account and a way to sign out', async ({ page }) => {
    await mockApi(page, { username: 'ada' });
    let signOuts = 0;
    await page.route('**/api/auth/logout', (route) => {
      signOuts += 1;
      return route.fulfill({ json: { redirectTo: '/signed-out' } });
    });
    await page.goto('/');

    await expect(page.locator('app-account-menu')).toContainText('Signed in as ada');
    await expect(page.getByRole('link', { name: 'Account' })).toHaveAttribute('href', ACCOUNT_URL);
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/signed-out$/);
    expect(signOuts).toBe(1);
  });

  test('says once that a sign-in was cancelled', async ({ page }) => {
    await mockApi(page);
    await page.goto('/?signIn=cancelled');

    await expect(page.getByRole('status')).toHaveText('Sign-in cancelled.');
    await expect(page).toHaveURL(/\/$/);
  });

  test('the sage finishes his greeting and waits idle', async ({ page }) => {
    await page.clock.install();
    await mockApi(page);
    await page.goto('/');

    // Wave, then the whole greeting typed out (~50 characters a second).
    await page.clock.runFor(15_000);
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

test.describe('the title and the sage', () => {
  // Every framework the sage can know: the column is as tall as it gets.
  const versions = FRAMEWORK_IDS.flatMap((framework) =>
    ['1', '2', '3'].map((version) => ({ framework, version, docsBaseUrl: '', chunkCount: 1, ingestedAt: '' })),
  );

  test('stay put while they fit the window, and scroll with the page once it is too short', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await mockApi(page, { versions });
    await page.goto('/');
    await expect(page.locator('.indexed li')).toHaveCount(FRAMEWORK_IDS.length);
    const side = page.locator('.side');
    await expect(side).toHaveCSS('position', 'sticky');

    await page.setViewportSize({ width: 1280, height: 600 });
    await expect(side).toHaveCSS('position', 'static');

    // The list never scrolls on its own, so it needs no focus stop to be read with the keyboard.
    const list = page.locator('.indexed ul');
    expect(await list.evaluate((ul) => ul.scrollHeight - ul.clientHeight)).toBeLessThanOrEqual(1);
    await expect(list).not.toHaveAttribute('tabindex');
    const last = page.locator('.indexed li').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
});
