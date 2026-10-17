# passport-mrz-ocr

Optional, **offline** OCR for [`passport-mrz`](https://www.npmjs.com/package/passport-mrz):
finds the MRZ in a passport / ID card / visa photo, cleans it up and reads it with
tesseract.js, then parses and checks it with `passport-mrz`. Status: **beta**.

- Model, worker and wasm files are installed locally. No network at runtime.
- Reports OCR confidence, corrected lines, a confirmation read, and whether a person should
  review the result.

```sh
npm install passport-mrz-ocr
```

```ts
// Node
import { readMrzFromFile } from 'passport-mrz-ocr';
const { mrz, ocr } = await readMrzFromFile('photo.jpg', { parse: { referenceDate: '2026-10-17' } });

// Batch: reuse one engine
import { createNodeEngine, readMrzFromBuffer } from 'passport-mrz-ocr';
const engine = await createNodeEngine();
for (const buf of photos) console.log((await readMrzFromBuffer(buf, { engine })).mrz.fields);
await engine.terminate();
```

```ts
// Browser — first: npx passport-mrz-ocr-assets public/ocr
import { createBrowserEngine, readMrzFromImage } from 'passport-mrz-ocr/browser';
const engine = await createBrowserEngine('/ocr/');
const { mrz, ocr } = await readMrzFromImage(file, { engine });
if (ocr.reviewRecommended) showWarnings(ocr.reviewReasons);
```

Pipeline, offline guarantee and benchmark: see
[docs/OCR.md](https://github.com/lalchand07/passport-mrz/blob/main/docs/OCR.md). Licenses of
the bundled engine and model: see `DATA_LICENSES.md` (Apache-2.0 tesseract.js, tesseract.js-core
and tessdata; BSD-3-Clause jpeg-js; MIT pngjs).

**Never use real passport data in issues or tests.** MIT licensed.
