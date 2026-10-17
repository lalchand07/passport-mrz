// Copy shared docs into a package directory before `npm pack` / `npm publish`.
//   node scripts/copy-docs.mjs core|ocr
import { copyFileSync } from 'node:fs';

const pkg = process.argv[2];
const root = new URL('../', import.meta.url);
const dest = new URL(`../packages/${pkg}/`, import.meta.url);
copyFileSync(new URL('LICENSE', root), new URL('LICENSE', dest));
copyFileSync(new URL('DATA_LICENSES.md', root), new URL('DATA_LICENSES.md', dest));
if (pkg === 'core') copyFileSync(new URL('README.md', root), new URL('README.md', dest));
