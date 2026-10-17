#!/usr/bin/env node
// Copy the OCR runtime files (worker, wasm core, English model) into a directory served by
// your site, so the browser never loads them from a CDN.
//   npx passport-mrz-ocr-assets public/ocr
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const dest = resolve(process.argv[2] ?? 'public/ocr');
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const tesseract = pkgDir('tesseract.js');
const core = pkgDir('tesseract.js-core');
const eng = pkgDir('@tesseract.js-data/eng');

mkdirSync(join(dest, 'core'), { recursive: true });
mkdirSync(join(dest, 'lang'), { recursive: true });
const copies = [
  [join(tesseract, 'dist', 'worker.min.js'), join(dest, 'worker.min.js')],
  [join(tesseract, 'LICENSE.md'), join(dest, 'LICENSE-tesseract.js.md')],
  [join(core, 'LICENSE'), join(dest, 'core', 'LICENSE')],
  [join(eng, '4.0.0', 'eng.traineddata.gz'), join(dest, 'lang', 'eng.traineddata.gz')],
];
for (const f of readdirSync(core)) {
  if (/^tesseract-core.*\.wasm\.js$/.test(f)) copies.push([join(core, f), join(dest, 'core', f)]);
}
for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.error(`missing ${from}`);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(from, to);
  console.log(`copied ${to}`);
}
