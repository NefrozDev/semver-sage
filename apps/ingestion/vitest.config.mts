import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/ingestion',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'ingestion',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // *.int.spec.ts need a database: see vitest.integration.config.mts
    exclude: ['**/node_modules/**', 'src/**/*.int.spec.ts'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/ingestion',
      provider: 'v8' as const,
      // lcov is what SonarQube reads (sonar-project.properties)
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    },
  },
}));
