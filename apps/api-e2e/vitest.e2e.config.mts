import { defineConfig } from 'vitest/config';

// Named *.e2e.config so the Nx Vitest plugin doesn't infer a unit `test` target for it:
// these tests need the running API (and its database) and run via `nx e2e api-e2e`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-e2e',
  test: {
    name: 'api-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globalSetup: ['src/wait-for-api.ts'],
    testTimeout: 30_000,
    reporters: ['default'],
  },
}));
