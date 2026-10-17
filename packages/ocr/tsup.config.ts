import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { node: 'src/node.ts', browser: 'src/browser.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
  sourcemap: true,
  shims: true,
  external: ['passport-mrz', 'tesseract.js', 'jpeg-js', 'pngjs', '@tesseract.js-data/eng'],
});
