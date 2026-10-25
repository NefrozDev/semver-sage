import { defineConfig, devices } from '@playwright/test';

const PORT = 4300;
const ci = !!process.env['CI'];

/**
 * Browser tests for the web app. They run against the production build (served by
 * static-server.mjs) with every /api call mocked, so they need no database or LLM.
 */
export default defineConfig({
  testDir: './src',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci
    ? [['github'], ['html', { open: 'never', outputFolder: '../../dist/.playwright/report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: '../../dist/.playwright/report' }]],
  outputDir: '../../dist/.playwright/results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `node static-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !ci,
  },
});
