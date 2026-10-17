# passport-mrz — implementation plan

> **Spec provenance (read this first).** ICAO Doc 9303 could not be downloaded from
> icao.int during development (the site returned a Cloudflare challenge to every scripted
> request). The parser was therefore written **from general knowledge of Doc 9303, not
> from the official text**. Every format is marked **beta** until it has been checked
> against the official specification. The specific details that need verification are
> listed in [docs/FORMAT_NOTES.md](docs/FORMAT_NOTES.md#details-to-verify-against-the-official-text).
> No ICAO documents are committed to this repository.

## Goals

1. Read and validate the MRZ of passports (TD3), ID cards (TD1, TD2) and visas (MRV-A, MRV-B).
2. Recover from typical OCR mistakes using the check digits, conservatively, and report
   every change.
3. Add the travel checks agencies need: validity on the travel/return date, passenger
   type by age, airline-formatted names, and a flat passenger record for CRM import.
4. Privacy first: everything runs locally. No network calls in the library, the CLI or
   the playground.

## Repository layout (npm workspaces)

```
packages/core        → npm "passport-mrz"      zero runtime dependencies
  src/checkDigit.ts    7-3-1 check digit
  src/formats.ts       field layout tables for TD1, TD2, TD3, MRV-A, MRV-B
  src/normalize.ts     input cleanup (case, whitespace, « → <<, line splitting)
  src/detect.ts        format auto-detection
  src/dates.ts         YYMMDD parsing and century inference
  src/names.ts         primary/secondary identifier split, truncation detection
  src/countries.ts     ISO 3166-1 alpha-3 + ICAO special codes → names (generated data)
  src/correct.ts       checksum-guided OCR correction
  src/parse.ts         parseMrz(): ties it together, never throws
  src/travel/          validForTravel, passengerType, airlineName, toPassenger
  src/generate/        synthetic MRZ generator + OCR-style mutator (test data)
  src/cli.ts           `passport-mrz` command
packages/ocr         → npm "passport-mrz-ocr"  optional: tesseract.js + image pipeline
playground/          → Vite static site, deployed to GitHub Pages
docs/                → FORMAT_NOTES.md, OCR.md
```

Entry points of `passport-mrz`: `.` (parser), `./travel`, `./generate`. ESM + CJS + `.d.ts`
built with tsup. Node 20+ and modern browsers.

## Parser approach

1. **Normalize**: uppercase; map `«` to `<<`; remove spaces and tabs inside lines;
   split into lines on newlines. A single line of length 88, 72 or 90 is split into
   2×44, 2×36 or 3×30. Blank lines are dropped.
2. **Detect format** from line count and length (3×30 → TD1; 2×36 → TD2 or MRV-B;
   2×44 → TD3 or MRV-A), with `V` as first character selecting the visa formats.
   Lines off by a few characters are padded with `<` / trimmed of trailing `<` with a
   warning; larger mismatches are an error.
3. **Extract fields** using a declarative table of `[line, start, length, charClass]`
   per format. Each check digit is declared with the fields it covers; the composite
   check is a list of ranges.
4. **Validate**: each check digit separately (`checks[]`), dates (real calendar dates),
   sex (`M`, `F`, `<`, `X`), country codes (known or not), character set.
5. **Correct** (see below) when a check fails, unless `correct: false`.
6. **Interpret**: dates with century inference, names, country names, TD1/TD2 long
   document number rule.
7. Return a `MrzResult` with `valid`, `format`, `fields`, `checks`, `corrections`,
   `errors`, `warnings`, the normalized `lines`. **Never throws**: any unexpected
   exception is caught and returned as an `internal_error` error.

### Century inference

Relative to `referenceDate` (default: now):

- Birth date: the latest century that does not put the date after the reference date.
- Expiry date: `20YY` unless that is more than `expiryMaxYearsAhead` (default 20) years
  after the reference date, in which case `19YY`.

## Checksum-guided correction algorithm

OCR confuses `O/0, I/1, B/8, S/5, Z/2, G/6` (plus `D/0`, `Q/0` one-way). Each field has a
character class: `digit` (dates, check digits), `alpha` (country codes, sex, names),
`alnum` (document number, optional data).

1. **Class repairs** — a letter in a digit-only field (or a digit in a letter-only field)
   is definitely wrong. If it has exactly one confusable counterpart it is repaired.
2. **Check-digit search** — for each failing check digit, enumerate substitutions over
   the confusable positions the check covers, in increasing number of substitutions
   (`k = 1 … maxSubstitutions`, default 2). Only substitutions allowed by each
   position's character class are tried. At the smallest `k` that yields any valid
   candidate:
   - exactly one candidate → accept it;
   - more than one → try to break the tie with the composite check digit (only one
     combination making the composite valid → accept); otherwise **ambiguous**: no change,
     report the candidates.
3. Every accepted change is reported as
   `{ field, position, original, corrected, reason }`. Corrections are never silent.
4. Corrected outputs always pass every check digit they claim to fix (property-tested).

## Travel checks (`passport-mrz/travel`)

- `validForTravel(result, { travelDate, returnDate?, minMonthsValidity = 6 })` →
  `{ ok, rule, message, expiryDate, requiredUntil }`. Required date = (return date or
  travel date) + N months, clamped to month end.
- `passengerType(dob, travelDate, { returnDate?, infantUnder = 2, childUnder = 12 })` →
  `ADT | CHD | INF`, ages, and a note when the type changes between outbound and return.
- `airlineName(result, opts)` → `SURNAME/GIVEN MIDDLE TITLE` with configurable title
  rules and truncation warnings.
- `toPassenger(result, opts)` → flat object for CRM import.

## OCR pipeline (`passport-mrz-ocr`)

1. Decode image (browser: canvas `ImageData`; Node: `jpeg-js` / `pngjs`).
2. Grayscale, downscale to a working width.
3. **Locate MRZ**: horizontal projection of a dark-on-light edge map; search the lower
   part of the page for 2–3 evenly spaced, wide, high-density text bands.
4. Crop with margin, **deskew lightly** (try angles −5°…+5°, keep the one maximizing
   row-profile variance), Otsu threshold.
5. OCR with tesseract.js (`eng` model, whitelist `A-Z0-9<`, single-block mode).
6. Parse with `passport-mrz` (correction on). Report OCR confidence per line and which
   lines were corrected.

All OCR assets (worker, wasm core, traineddata) are loaded from local paths; the library
sets `workerPath`, `corePath` and `langPath` explicitly so tesseract.js never hits a CDN.

## Licenses

| Item | Source | License |
| --- | --- | --- |
| Library code | this repo | MIT |
| Country names | `i18n-iso-countries` (English), generated at dev time | MIT |
| ICAO special codes | hand-written from general knowledge of Doc 9303 | MIT (facts) |
| OCR model | `eng.traineddata` via `@tesseract.js-data/eng` (from tesseract-ocr tessdata) | Apache-2.0 |
| OCR engine | `tesseract.js`, `tesseract.js-core` | Apache-2.0 |

MRZ-specific models (e.g. `tessdata_ocrb`, `tesseractMRZ`) were considered; their
licenses could not be verified from this environment, so the standard English model is
used with a whitelist, relying on checksum correction. No OCR-B font is bundled;
synthetic OCR images are rendered at benchmark time from fonts installed on the machine.

## Test plan

- ≥100 parser cases: every format, ICAO specimens, generated documents, check digit
  failures, accepted and ambiguous corrections, truncated names, edge dates, garbage.
- Property tests (fast-check): `parseMrz` never throws on arbitrary strings; corrected
  outputs always satisfy their check digits; generated MRZs always parse valid.
- OCR: pipeline unit tests on generated canvases (pure JS raster), plus an optional
  benchmark rendering synthetic MRZ images with headless Chromium.
