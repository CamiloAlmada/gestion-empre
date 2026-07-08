import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: { pretendToBeVisual: true },
    },
    // test-setup.ts: polyfill de <dialog> para jsdom (B2).
    // vitest.setup.ts: matchers de @testing-library/jest-dom (B3).
    setupFiles: ['./src/test-setup.ts', './src/vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
