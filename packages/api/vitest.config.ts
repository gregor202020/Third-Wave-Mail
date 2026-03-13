import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/seed-*.ts'],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      // Allow importing from workers package via relative path
      '@twmail/workers': resolve(__dirname, '../workers/src'),
    },
  },
});
