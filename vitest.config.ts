import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const core = (path: string) =>
  fileURLToPath(new URL(`./packages/core/src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Test the OCR package against the core sources, without a build step.
    alias: [
      { find: /^passport-mrz$/, replacement: core('index.ts') },
      { find: /^passport-mrz\/(travel|generate)$/, replacement: core('$1/index.ts') },
    ],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
