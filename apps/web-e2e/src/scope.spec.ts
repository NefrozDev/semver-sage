import { expect, test } from '@playwright/test';
import { answerEvents, mockApi } from './support/mock-api';

test.describe('scoping a question', () => {
  test('framework, version and compare pickers are sent with the question', async ({ page }) => {
    const api = await mockApi(page, {
      hold: false,
      events: [
        {
          type: 'scope',
          scope: { framework: 'vue', requestedVersion: '2', version: '2', source: 'request' },
          compare: { framework: 'vue', requestedVersion: '3', version: '3', source: 'request' },
        },
        ...answerEvents({ answer: 'Short answer.' }).slice(1),
      ],
    });
    await page.goto('/');

    const version = page.locator('input[name=version]');
    await expect(version).toBeDisabled();
    await page.locator('select[name=framework]').selectOption('vue');
    await version.fill('2');
    await page.locator('input[name=compareVersion]').fill('3');
    await page.getByRole('textbox', { name: 'Your question' }).fill('v-model');
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(page.locator('.scope .chip')).toHaveText('Comparing Vue 2 → 3');
    expect(api.requests).toEqual([{ question: 'v-model', framework: 'vue', version: '2', compareVersion: '3' }]);
    // The scope stays selected for the follow-up.
    await expect(version).toHaveValue('2');
  });

  test('"since when?" answers show the searched range and the earliest version found', async ({ page }) => {
    await mockApi(page, {
      hold: false,
      events: [
        {
          type: 'scope',
          scope: { framework: 'vue', requestedVersion: null, version: '3', source: 'latest' },
          history: { oldest: '1', earliest: '2' },
        },
        ...answerEvents({ answer: '**Since Vue 2.**' }).slice(1),
      ],
    });
    await page.goto('/');

    await page.getByRole('textbox', { name: 'Your question' }).fill('When were filters added to Vue?');
    await page.getByRole('button', { name: 'Ask' }).click();

    await expect(page.locator('.scope .chip')).toHaveText('Vue 1–3 history');
    await expect(page.locator('.scope .note')).toHaveText('First found in the Vue 2 docs.');
    await expect(page.locator('app-answer-card')).toContainText('Since Vue 2.');
  });

  test('a package.json scopes questions to the installed versions', async ({ page }) => {
    const api = await mockApi(page, { hold: false });
    await page.goto('/');

    await page.locator('input[type=file]').setInputFiles({
      name: 'package.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ dependencies: { vue: '^2.6.14', react: '^18.2.0' } })),
    });

    const vue = page.getByRole('button', { name: 'Vue 2.6.14' });
    await expect(vue).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'React 18.2.0' })).toBeDisabled(); // not indexed in the mock
    await expect(page.locator('select[name=framework]')).toHaveValue('vue');

    await page.getByRole('textbox', { name: 'Your question' }).fill('filters');
    await page.getByRole('button', { name: 'Ask' }).click();
    await expect.poll(() => api.requests).toEqual([{ question: 'filters', framework: 'vue', version: '2.6.14' }]);
  });

  test('an invalid package.json is reported', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles({
      name: 'package.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ not json'),
    });
    await expect(page.getByText("That doesn't look like a valid package.json.")).toBeVisible();
  });

  test('AngularJS is labelled as its own framework', async ({ page }) => {
    await mockApi(page, {
      hold: false,
      events: [
        {
          type: 'scope',
          scope: {
            framework: 'angular',
            requestedVersion: '1.8.2',
            version: null,
            source: 'request',
            note: 'AngularJS (1.x) is a separate framework from Angular 2+.',
          },
        },
        { type: 'citations', citations: [] },
        { type: 'token', text: '**Angular 1.x is AngularJS**, a different framework.' },
        { type: 'done', model: 'none', elapsedMs: 3 },
      ],
    });
    await page.goto('/');

    await page.locator('input[type=file]').setInputFiles({
      name: 'package.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ dependencies: { angular: '^1.8.2' } })),
    });
    await expect(page.getByRole('button', { name: 'AngularJS 1.8.2' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Your question' }).fill('How do directives work?');
    await page.getByRole('button', { name: 'Ask' }).click();
    await expect(page.locator('.scope .chip')).toHaveText('AngularJS is not Angular');
    await expect(page.locator('.scope .note')).toHaveText('AngularJS (1.x) is a separate framework from Angular 2+.');
    // A fixed notice, not an LLM answer: no "Answered by" footer.
    await expect(page.locator('app-answer-card')).toContainText('Angular 1.x is AngularJS');
    await expect(page.locator('app-answer-card footer')).toHaveCount(0);
  });
});
