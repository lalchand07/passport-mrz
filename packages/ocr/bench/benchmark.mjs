// OCR accuracy benchmark on synthetic document photos (all data invented).
//   npm run build && node packages/ocr/bench/benchmark.mjs [count]
// Needs a Chromium binary (CHROMIUM_PATH) and fonts installed on the machine.
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseMrz } from 'passport-mrz';
import { generateMrz, createRng } from 'passport-mrz/generate';
import { createNodeEngine, readMrzFromBuffer } from 'passport-mrz-ocr';
import { openRenderer } from './render.mjs';

const count = Number(process.argv[2] ?? 40);
const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const rng = createRng(2026);
const formats = ['TD3', 'TD3', 'TD1', 'TD2', 'MRVA', 'MRVB'];
const fonts = ["'DejaVu Sans Mono'", "'Liberation Mono'", "'FreeMono'"];
const renderer = await openRenderer();
const engine = await createNodeEngine();

const rows = [];
for (let i = 0; i < count; i++) {
  const format = formats[i % formats.length];
  const g = generateMrz({ format, seed: 1000 + i });
  const opts = {
    rotate: Math.round((rng() * 8 - 4) * 10) / 10,
    blur: Math.round(rng() * 1.2 * 10) / 10,
    fontSize: 28 + Math.floor(rng() * 10),
    font: fonts[i % fonts.length],
  };
  const png = await renderer.render(g.lines, opts);
  if (i < 6) writeFileSync(new URL(`sample-${i}.png`, outDir), png);
  const t = Date.now();
  const r = await readMrzFromBuffer(png, { engine, parse: { referenceDate: '2026-10-17' } });
  const exact = r.mrz.lines.join('\n') === g.lines.join('\n');
  const truth = parseMrz(g.lines, { referenceDate: '2026-10-17' }).fields;
  const wrongFields = Object.keys(truth).filter(
    (k) => JSON.stringify(truth[k]) !== JSON.stringify(r.mrz.fields[k]),
  );
  rows.push({
    i,
    format,
    ...opts,
    ms: Date.now() - t,
    found: r.ocr.mrzFound,
    valid: r.mrz.valid,
    exact,
    corrected: r.mrz.corrections.length > 0,
    lengthRepaired: r.mrz.warnings.some((w) => w.code === 'line_length_repaired'),
    falseValid: r.mrz.valid && !exact,
    review: r.ocr.reviewRecommended,
    confirmed: r.ocr.confirmed,
    disagreed: !!r.ocr.alternative,
    wrongFields,
    confidence: r.ocr.confidence,
  });
  process.stdout.write(exact ? '.' : r.mrz.valid ? '!' : 'x');
}
await engine.terminate();
await renderer.close();

const pct = (n) => `${((100 * n) / rows.length).toFixed(1)}%`;
const summary = {
  images: rows.length,
  mrzLocated: pct(rows.filter((r) => r.found).length),
  exactAfterCorrection: pct(rows.filter((r) => r.exact).length),
  validButWrong: rows.filter((r) => r.falseValid).length,
  confirmed: pct(rows.filter((r) => r.confirmed).length),
  confirmedButWrong: rows.filter((r) => r.confirmed && !r.exact).length,
  validButWrongCaughtByDisagreement: rows.filter((r) => r.falseValid && r.disagreed).length,
  validButWrongNotFlagged: rows.filter((r) => r.falseValid && !r.review).length,
  exactWithoutReviewFlag: pct(rows.filter((r) => r.exact && !r.review).length),
  neededCorrection: pct(rows.filter((r) => r.exact && (r.corrected || r.lengthRepaired)).length),
  /** Among valid-but-wrong results: how often each field was wrong. */
  validButWrongFields: rows
    .filter((r) => r.falseValid)
    .flatMap((r) => r.wrongFields)
    .reduce((acc, f) => ({ ...acc, [f]: (acc[f] ?? 0) + 1 }), {}),
  meanMs: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
  byFormat: Object.fromEntries(
    [...new Set(rows.map((r) => r.format))].map((f) => {
      const sub = rows.filter((r) => r.format === f);
      return [f, `${sub.filter((r) => r.exact).length}/${sub.length}`];
    }),
  ),
};
writeFileSync(new URL('results.json', outDir), JSON.stringify({ summary, rows }, null, 2));
console.log('\n' + JSON.stringify(summary, null, 2));
