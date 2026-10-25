import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Integration tests against a real Postgres (a separate test database, created and migrated by
// global-setup). Named *.integration.config so the Nx Vitest plugin doesn't treat it as the unit
// test target; run with `nx run ingestion:integration`.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/ingestion-integration',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'ingestion-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.int.spec.ts'],
    globalSetup: ['src/testing/global-setup.ts'],
    // One shared database: run files one at a time.
    fileParallelism: false,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/ingestion-integration',
      provider: 'v8' as const,
      // Also covers server-core (retriever, migrations): paths relative to the repo root.
      reporter: ['text-summary', ['lcov', { projectRoot: resolve(import.meta.dirname, '../..') }]],
      allowExternal: true,
      include: ['src/**/*.ts', '../../libs/server/core/src/**/*.ts'],
      exclude: ['**/*.spec.ts', 'src/testing/**'],
    },
  },
}));
