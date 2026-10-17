# passport-mrz

**Read, check and correct passport, ID card and visa MRZs, with the travel checks agencies need. Runs entirely on your device.**

> 🔗 **Playground:** _link placeholder — https://lalchand07.github.io/passport-mrz/ once GitHub Pages is enabled_
>
> 🖼️ _Screenshot placeholder_

Travel agencies (especially Umrah and visa agencies) receive hundreds of passport photos over WhatsApp and type them into booking systems by hand. `passport-mrz` reads the machine-readable zone (the two or three lines of `<<<` text at the bottom of the page). It validates every check digit, fixes typical OCR mistakes where the check digits prove the fix, and answers the questions agencies actually ask:

- Is the passport valid for at least 6 months after the return date?
- Is this passenger an adult, child or infant on the travel date (and on the return date)?
- What is the airline-ready name: `SURNAME/GIVEN MIDDLE MR`?

> ⚠️ **Beta: the formats have not yet been checked against the official ICAO text.** ICAO Doc 9303 could not be downloaded while this library was written, so the parser was written **from general knowledge of Doc 9303, not from the official text**. Every format is marked beta (`result.beta === true`) until it has been verified. [docs/FORMAT_NOTES.md](docs/FORMAT_NOTES.md#details-to-verify-against-the-official-text) lists exactly what needs checking: field offsets, which fields each composite check digit covers, and the TD1 long document number rule.

## Privacy model

**Passport data never leaves the device.**

- The core library is pure TypeScript with **zero runtime dependencies** and makes **no network calls**. It runs in the browser or in your own Node process.
- The optional OCR package uses tesseract.js with the **model, worker and wasm files installed locally**. All paths are set explicitly, so tesseract.js never falls back to a CDN.
- The playground is a static page. Its Content-Security-Policy blocks every request except loading its own files from the same origin, and the OCR worker starts from a `blob:` URL so the policy applies inside it too. It stores nothing: no cookies and no local storage.
- The repository contains **no real passport data or images**. Tests use generated documents with invented names and numbers, plus ICAO's fictitious "UTO / ERIKSSON" specimen MRZs.

## Install

```sh
npm install passport-mrz            # parser, corrections, travel checks, CLI (no dependencies)
npm install passport-mrz-ocr        # optional: read the MRZ from a photo (tesseract.js + local model, ~60 MB installed)
```

Requires Node 20+ or a modern browser. ESM and CommonJS builds are included, with TypeScript types.

## 30-second example

```ts
import { parseMrz } from 'passport-mrz';
import { validForTravel, passengerType, airlineName, toPassenger } from 'passport-mrz/travel';

const result = parseMrz(`P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
L8989O2C36UTO7408122F1204159ZE184226B<<<<<10`); // note the OCR error: O instead of 0

result.valid; // true: the check digit proved the fix
result.fields.documentNumber; // 'L898902C3'
result.corrections; // [{ field: 'documentNumber', original: 'L8989O2C3', corrected: 'L898902C3', reason: 'check-digit', … }]
result.checks; // each check digit: { name, valid, computed, printed, corrected }

validForTravel(result, { travelDate: '2026-12-15', returnDate: '2026-12-20' }).message;
// 'Expires 2012-04-15, which is before the travel date 2026-12-15.'

passengerType(result.fields.birthDate, '2026-12-15').type; // 'ADT'
airlineName(result, { travelDate: '2026-12-15' }).name; // 'ERIKSSON/ANNA MARIA MS'
toPassenger(result, { travelDate: '2026-12-15' }); // flat object for CRM / spreadsheet import
```

`parseMrz` **never throws**. Bad input returns `valid: false` with structured `errors` and `warnings`, each carrying a stable `code`.

### CLI

```sh
npx passport-mrz "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<" \
                 "L898902C36UTO7408122F1204159ZE184226B<<<<<10" --travel-date 2026-12-15
cat mrz.txt | npx passport-mrz --travel-date 2026-12-15 --return-date 2027-01-10
npx -p passport-mrz -p passport-mrz-ocr passport-mrz --image photo.jpg --travel-date 2026-12-15
```

It prints JSON: `valid`, `passenger`, `travel` (when `--travel-date` is given), the full `mrz` result and, with `--image`, the `ocr` report. Exit codes: `0` valid, `1` invalid MRZ or failed travel check, `2` usage error, `3` OCR package missing or OCR failed. Run `--help` for all options.

### OCR

```ts
// Node
import { readMrzFromFile } from 'passport-mrz-ocr';
const { mrz, ocr } = await readMrzFromFile('photo.jpg');
ocr.confidence;
ocr.correctedLines;
ocr.reviewRecommended;
ocr.reviewReasons;

// Browser: copy the assets to your site first: npx passport-mrz-ocr-assets public/ocr
import { createBrowserEngine, readMrzFromImage } from 'passport-mrz-ocr/browser';
const engine = await createBrowserEngine('/ocr/');
const { mrz, ocr } = await readMrzFromImage(fileInput.files[0], { engine });
```

See [docs/OCR.md](docs/OCR.md) for the image pipeline and benchmark.

## Supported formats

| Format | Documents                           | Lines  | Check digits                                                     | Status |
| ------ | ----------------------------------- | ------ | ---------------------------------------------------------------- | ------ |
| TD3    | Passports                           | 2 × 44 | document number, birth, expiry, personal number, composite       | beta   |
| TD1    | ID cards                            | 3 × 30 | document number, birth, expiry, composite; long document numbers | beta   |
| TD2    | ID cards, official travel documents | 2 × 36 | document number, birth, expiry, composite                        | beta   |
| MRV-A  | Visas (full size)                   | 2 × 44 | document number, birth, expiry                                   | beta   |
| MRV-B  | Visas (smaller)                     | 2 × 36 | document number, birth, expiry                                   | beta   |

The format is detected automatically from the line count, line length and the first letter (`V` for visas). Input can be one string (newlines, or all lines run together) or an array of lines. It may be lowercase, contain spaces, use `«` for `<<`, or be surrounded by other OCR'd text.

Fields: document code and type, issuing state, surname, given names, document number, nationality, date of birth, sex, expiry date, and the personal number / optional data fields. Country codes are turned into names, including ICAO special codes such as `D` (Germany), `GBD`, `GBN`, `GBO`, `GBP`, `GBS`, `UNO`, `XXA`, `XXB`, `XXC` and `XXX`.

**Dates:** `YYMMDD` with century inference relative to `referenceDate` (default: today). A birth date gets the latest century that does not put it in the future. An expiry date can be up to 20 years ahead (`expiryMaxYearsAhead`).

**Names:** split on `<<` into surname and given names, with `<` becoming a space. When the name field is completely filled, the name was probably cut short, so `nameTruncated` is set and a `name_truncated` warning is added.

## Check digits and correction

Each check digit is computed with ICAO's 7-3-1 weighting (`0–9` = 0–9, `A–Z` = 10–35, `<` = 0, sum mod 10) and reported separately in `result.checks`.

OCR confuses `O/0`, `I/1`, `B/8`, `S/5`, `Z/2` and `G/6`. Correction is conservative, and every change is reported with the original and corrected value:

1. **Character class:** a letter in a digits-only field (dates, check digits) or a digit in a letters-only field (names, country codes) must be wrong, and it is replaced by its one look-alike. A digit in a country code is replaced only when exactly one known country results.
2. **Check-digit search:** for each failing check digit, try the smallest number of substitutions consistent with each position's character class. Accept the result only if **exactly one** candidate makes the check pass. If several do, nothing is changed and `result.ambiguities` lists the candidates.
3. **Composite tie-break:** if several candidates remain, keep the one that also satisfies the composite check digit.
4. **Fillers:** `<` read as `K` or `L` in trailing filler runs is restored. Check digits can't catch this, because `K` = 20 ≡ 0 = `<`.
5. **Missing or extra characters:** a line one or two characters too long (or one too short) is repaired at the position the check digits point to, if exactly one repair is best.

Pass `{ correct: false }` to disable correction, or `{ maxSubstitutions: n }` to change the search depth (default 2).

**Measured on 5,000 generated MRZs** with random OCR-style substitutions (see `packages/core/test/accuracy.test.ts`):

| OCR errors per MRZ | Fully restored | Still flagged invalid | Wrong character changes |
| ------------------ | -------------- | --------------------- | ----------------------- |
| 1                  | 91.5%          | 4.8%                  | 0.00%                   |
| 2                  | 82.1%          | 9.5%                  | 0.09%                   |
| 3                  | 75.4%          | 12.4%                 | 0.29%                   |

The remainder were neither restored nor flagged. These are errors no check digit can see (see limitations).

## Travel checks

```ts
validForTravel(result, { travelDate, returnDate?, minMonthsValidity = 6 })
// → { ok, rule, message, expiryDate, requiredUntil, travelDate, returnDate, mrzValid }
// "Expires 2027-03-02, which is less than 6 months after return date 2026-12-20."

passengerType(dob, travelDate, { returnDate?, infantUnder = 2, childUnder = 12 })
// → { type: 'ADT' | 'CHD' | 'INF', age, returnType, returnAge, changes, note }
// note: "Passenger is CHD (age 11) on 2026-12-15 but ADT (age 12) on return 2027-01-05."

airlineName(result, { travelDate, titles?, includeTitle, removeSurnameSpaces, missingGivenName, maxLength })
// → { name: 'SURNAME/GIVEN MIDDLE MR', title, warnings }
// Default titles: MR / MS (adults), MSTR / MISS (children and infants); e.g. titles: { adultFemale: 'MRS' }

toPassenger(result, options)
// → { surname, givenNames, airlineName, title, dateOfBirth, sex, nationality, nationalityName,
//     documentType, passportNumber, issuingCountry, issuingCountryName, expiryDate,
//     passengerType, mrzValid, warnings }
```

The validity rule: the document must not expire before the travel date, and must be valid until at least _(return date, or travel date) + N months_. The month end is clamped, so 31 August + 6 months = 28/29 February.

## Accuracy notes and limitations

- **Beta formats:** see the warning above and [docs/FORMAT_NOTES.md](docs/FORMAT_NOTES.md).
- **Names have no check digit.** OCR errors in names can only be caught when a digit appears in them. Always compare names with the visual zone, and use the full printed name when `nameTruncated` is set.
- **Some OCR swaps are invisible to check digits.** Characters whose values differ by a multiple of 10 give the same check digit: `8`/`I`/`S`, `6`/`G`/`Q`, `1`/`B`/`L`/`V`, `0`/`A`/`K`/`U`, `2`/`C`/`M`/`W`, and so on. The composite check digit rarely helps, because in ICAO layouts each field sits at an offset that is a multiple of 3 within the composite string, so it gets the same weights.
- **Visas (MRV-A/B) have no composite check digit**, so fewer errors can be detected.
- **OCR on photos:** blurry, glary, angled or low-resolution photos read badly. The OCR package uses tesseract's generic English model (no clearly licensed MRZ/OCR-B model was available), so it is weaker than dedicated MRZ readers. On 60 synthetic photos rendered in non-OCR-B monospace fonts, 58% were read exactly. Of the reads that validated but were wrong, all but one were flagged with `reviewRecommended`. Treat OCR output as a draft for a person to confirm.
- **Non-standard documents:** some countries put non-standard data in the optional fields, use `X` for sex, or leave unknown date parts as `<<`. These come back as warnings, not guesses.

## Roadmap

- Verify every layout against the official Doc 9303 text and remove the beta flag
- PHP port
- Python port
- MCP tool, so AI assistants can parse MRZs locally
- Visa page parsing (visual zone fields such as visa type, entries and duration)
- A licensed OCR-B / MRZ OCR model

## Repository layout

| Path            | What                                                              |
| --------------- | ----------------------------------------------------------------- |
| `packages/core` | `passport-mrz`: parser, correction, travel checks, generator, CLI |
| `packages/ocr`  | `passport-mrz-ocr`: image pipeline and tesseract.js integration   |
| `playground`    | Static demo site (Vite), deployed to GitHub Pages                 |
| `docs`          | [Format notes](docs/FORMAT_NOTES.md), [OCR](docs/OCR.md)          |
| `PLAN.md`       | Design plan                                                       |

```sh
npm ci && npm run build && npm test     # 300+ tests
npm run playground:dev                  # local playground
node packages/ocr/bench/benchmark.mjs   # OCR benchmark (needs Chromium)
```

## Licenses

Code: [MIT](LICENSE). Bundled and generated data, fonts and models: see [DATA_LICENSES.md](DATA_LICENSES.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Never submit real passport data. Security: [SECURITY.md](SECURITY.md).

## Built by

_Placeholder: Lal Chand / Codic Systems._ ([website](https://codicsystems.com) · [GitHub](https://github.com/lalchand07))
