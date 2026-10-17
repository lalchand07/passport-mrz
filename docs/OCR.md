# OCR (`passport-mrz-ocr`)

Optional package. The core `passport-mrz` stays dependency-free.

## Pipeline

1. **Decode**: browser `createImageBitmap` (applies EXIF orientation) → canvas `ImageData`;
   Node `jpeg-js` / `pngjs`. Photos are downscaled to a working width of 2000 px.
2. **Locate the MRZ** (on an 800 px copy): horizontal-gradient edge map → row projection.
   Text rows are rows whose edges cover ≥ 40 % of the width. Rows are grouped into bands and
   the lowest group of 2–3 similar, evenly spaced, left-aligned bands is chosen. If none is
   found, the bottom 35 % of the page is used.
3. **Deskew lightly**: angles −5°…+5° in 0.5° steps; the angle whose row projection of edge
   pixels is sharpest wins.
4. **Crop, scale and threshold**: crop with margins, scale so a text line is ~36 px high,
   stretch contrast, and produce two variants: Otsu-binarized and grayscale.
5. **OCR**: tesseract.js, whitelist `A–Z 0–9 <`, single-block mode, dictionaries off. Passes:
   the legacy engine first (it honours the whitelist strictly and read monospaced MRZ text
   best in our tests), then LSTM.
6. **Parse** with `passport-mrz` (all corrections on). Tried in order: pass × variant, then
   rotations 0°, 180° (and 90°/270° only if no MRZ format was found at all).
7. **Confirm**: after the first valid read, one more independent attempt runs. If it reads
   a different valid MRZ, the result is flagged for review and the alternative is returned.

The report (`result.ocr`) includes OCR confidence (overall and per line), which lines were
changed by correction, the pass/variant/rotation used, the MRZ region and skew angle,
`confirmed`, `alternative`, and `reviewRecommended` with human-readable `reviewReasons`.

## Offline guarantee

All tesseract.js paths are set explicitly:

- Node: `langPath` points at `@tesseract.js-data/eng/4.0.0` in `node_modules`; the worker and
  wasm core load from `node_modules`; `cacheMethod: 'none'` (nothing is written to disk).
- Browser: `createBrowserEngine(url)` uses `url/worker.min.js`, `url/core/`, `url/lang/`. Copy
  them with `npx passport-mrz-ocr-assets public/ocr`. The worker starts from a `blob:` URL so the
  page's CSP applies inside it.

A unit test fails if `fetch` is called while the Node engine starts and recognizes.

## Benchmark

`node packages/ocr/bench/benchmark.mjs [count]` renders synthetic document photos (invented
data) with headless Chromium, using installed monospace fonts (DejaVu Sans Mono, Liberation
Mono, FreeMono; **not** OCR-B), random rotation (±4°), blur (0–1.2 px) and font size. Then it
runs the full pipeline.

Results on 60 images (Node 22, legacy + LSTM, confirmation on):

| Metric                                  | Result                                                |
| --------------------------------------- | ----------------------------------------------------- |
| MRZ region located                      | 100 %                                                 |
| Read exactly right (after correction)   | 58.3 %                                                |
| Needed a correction to be exactly right | 31.7 % of all images                                  |
| Validated but wrong                     | 18 (most often: document number 8, given names 6)     |
| …of which flagged `reviewRecommended`   | 17                                                    |
| Mean time per image                     | ~0.6 s                                                |
| By format (exact)                       | TD3 12/20, TD1 7/10, TD2 6/10, MRV-A 7/10, MRV-B 3/10 |

These fonts are harder for tesseract's generic English model than real OCR-B MRZs in some
ways and easier in others (clean rendering, no glare, no paper texture), so treat the numbers
as indicative only. Real phone photos of passports have not been benchmarked: the project
does not collect real passport images.

## Known weaknesses

- Generic model: confuses `9/I`, `J/I`, `Q/O`, `M/H` and miscounts filler runs. A licensed
  MRZ/OCR-B model would help (see roadmap).
- Errors that check digits cannot see (see the README) may produce a valid but wrong
  result. Always show `reviewReasons` to the user and ask them to compare with the photo.
