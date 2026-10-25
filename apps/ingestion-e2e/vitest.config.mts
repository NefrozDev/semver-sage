import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ingestion-e2e',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
