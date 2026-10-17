import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      travel: 'src/travel/index.ts',
      generate: 'src/generate/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'es2022',
    sourcemap: true,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    external: ['passport-mrz-ocr'],
    define: { __VERSION__: JSON.stringify(version) },
  },
]);
