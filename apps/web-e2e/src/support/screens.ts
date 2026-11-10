import { expect, type Page } from '@playwright/test';
import { answerEvents, mockApi } from './mock-api';

export interface Screen {
  name: string;
  url?: string;
  /** Sets up the mocked API and brings the page to the state to check. */
  open: (page: Page) => Promise<void>;
  /** A request stays pending on purpose: do not wait for the network to settle. */
  pending?: boolean;
}

const ask = async (page: Page, question = 'How do I register a global filter in Vue 2?') => {
  const box = page.getByRole('textbox', { name: 'Your question' });
  await box.fill(question);
  await box.press('Enter');
};

// The page in each of its states that shows something different.
export const screens: Screen[] = [
  {
    name: 'landing',
    open: async (page) => {
      await mockApi(page);
      await page.goto('/');
    },
  },
  {
    name: 'landing, signed in',
    open: async (page) => {
      await mockApi(page, { username: 'ada' });
      await page.goto('/');
      await expect(page.locator('app-account-menu')).toContainText('Signed in as ada');
    },
  },
  {
    name: 'sign-in cancelled',
    open: async (page) => {
      await mockApi(page);
      await page.goto('/?signIn=cancelled');
      await expect(page.getByRole('status')).toHaveText('Sign-in cancelled.');
    },
  },
  {
    name: 'API unreachable',
    open: async (page) => {
      await mockApi(page, { versions: 'error' });
      await page.goto('/');
      await expect(page.getByText('API unreachable')).toBeVisible();
    },
  },
  {
    name: 'reflecting',
    pending: true,
    open: async (page) => {
      await mockApi(page);
      await page.goto('/');
      await ask(page);
      await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    },
  },
  {
    name: 'answered',
    open: async (page) => {
      await mockApi(page, { hold: false, events: answerEvents({ answer: 'Use `Vue.filter()` [1].' }) });
      await page.goto('/');
      await ask(page);
      await expect(page.locator('app-answer-card footer')).toBeVisible();
    },
  },
  {
    name: 'answer failed',
    open: async (page) => {
      await mockApi(page, {
        hold: false,
        events: [
          { type: 'scope', scope: { framework: 'vue', requestedVersion: null, version: '3', source: 'latest' } },
          { type: 'citations', citations: [] },
          { type: 'error', message: "Can't reach the LLM" },
        ],
      });
      await page.goto('/');
      await ask(page);
      await expect(page.locator('app-answer-card .error')).toBeVisible();
    },
  },
  {
    name: 'scope chosen',
    open: async (page) => {
      await mockApi(page);
      await page.goto('/');
      await page.locator('select[name=framework]').selectOption('vue');
      await page.locator('input[name=version]').fill('2');
    },
  },
];

/** Opens the state, then waits until nothing more is loading. */
export async function openScreen(page: Page, screen: Screen): Promise<void> {
  await screen.open(page);
  await expect(page.locator('h1')).toBeAttached();
  if (!screen.pending) await page.waitForLoadState('networkidle');
}
