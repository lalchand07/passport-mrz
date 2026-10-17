# MRZ format notes

> **Beta — not verified against the official specification.** ICAO Doc 9303 could not
> be downloaded from icao.int while this library was written (scripted requests were
> blocked by a Cloudflare challenge). Everything below, and the parser built from it,
> comes from **general knowledge of Doc 9303, not the official text**. All formats are
> flagged `beta: true` in parser output until a maintainer has checked each item in
> [Details to verify](#details-to-verify-against-the-official-text) against Doc 9303
> Parts 3, 4, 5 and 7. If you can verify any of them, please open an issue or PR citing
> the part, section and edition. Do not attach or commit ICAO documents.

Positions below are 0-based, `[start, end)`.

## Character set and check digits

- Characters: `A–Z`, `0–9`, filler `<`.
- Check digit: multiply each character's value by weights `7, 3, 1, 7, 3, 1 …`, sum,
  take modulo 10. Values: `0–9` → 0–9, `A–Z` → 10–35, `<` → 0.

## TD3 — passports (2 × 44)

| Line | Pos | Len | Field |
| --- | --- | --- | --- |
| 1 | 0 | 2 | Document code (`P` + type or `<`) |
| 1 | 2 | 3 | Issuing state |
| 1 | 5 | 39 | Name |
| 2 | 0 | 9 | Document number |
| 2 | 9 | 1 | Check digit (document number) |
| 2 | 10 | 3 | Nationality |
| 2 | 13 | 6 | Date of birth YYMMDD |
| 2 | 19 | 1 | Check digit (birth) |
| 2 | 20 | 1 | Sex |
| 2 | 21 | 6 | Expiry YYMMDD |
| 2 | 27 | 1 | Check digit (expiry) |
| 2 | 28 | 14 | Personal number / optional data |
| 2 | 42 | 1 | Check digit (personal number; may be `<` when the field is all filler) |
| 2 | 43 | 1 | Composite check digit |

Composite covers line 2 `[0,10) + [13,20) + [21,43)`.

## TD1 — ID cards (3 × 30)

| Line | Pos | Len | Field |
| --- | --- | --- | --- |
| 1 | 0 | 2 | Document code (`I`, `A`, `C` + type) |
| 1 | 2 | 3 | Issuing state |
| 1 | 5 | 9 | Document number |
| 1 | 14 | 1 | Check digit (document number) |
| 1 | 15 | 15 | Optional data 1 |
| 2 | 0 | 6 | Date of birth |
| 2 | 6 | 1 | Check digit (birth) |
| 2 | 7 | 1 | Sex |
| 2 | 8 | 6 | Expiry |
| 2 | 14 | 1 | Check digit (expiry) |
| 2 | 15 | 3 | Nationality |
| 2 | 18 | 11 | Optional data 2 |
| 2 | 29 | 1 | Composite check digit |
| 3 | 0 | 30 | Name |

Composite covers line 1 `[5,30)` + line 2 `[0,7) + [8,15) + [18,29)`.

**Long document number rule:** when the document number is longer than 9 characters,
the first 9 go in line 1 `[5,14)`, position 14 is `<`, and the remaining characters
followed by the check digit of the *full* number are placed at the start of optional
data 1, terminated by `<`.

## TD2 — ID cards / official travel documents (2 × 36)

| Line | Pos | Len | Field |
| --- | --- | --- | --- |
| 1 | 0 | 2 | Document code |
| 1 | 2 | 3 | Issuing state |
| 1 | 5 | 31 | Name |
| 2 | 0 | 9 | Document number |
| 2 | 9 | 1 | Check digit (document number) |
| 2 | 10 | 3 | Nationality |
| 2 | 13 | 6 | Date of birth |
| 2 | 19 | 1 | Check digit (birth) |
| 2 | 20 | 1 | Sex |
| 2 | 21 | 6 | Expiry |
| 2 | 27 | 1 | Check digit (expiry) |
| 2 | 28 | 7 | Optional data |
| 2 | 35 | 1 | Composite check digit |

Composite covers line 2 `[0,10) + [13,20) + [21,35)`. The long document number rule is
assumed to apply as in TD1, with the overflow at the start of the optional data.

## MRV-A (2 × 44) and MRV-B (2 × 36) — visas

Same as TD3 / TD2 line 2 up to position 28, with no composite check digit and no
personal-number check digit:

| Line | Pos | Len | Field |
| --- | --- | --- | --- |
| 1 | 0 | 2 | Document code (`V` + type) |
| 1 | 2 | 3 | Issuing state |
| 1 | 5 | 39 / 31 | Name |
| 2 | 0–27 | | as TD3 |
| 2 | 28 | 16 / 8 | Optional data |

## Names

Primary identifier (surname) and secondary identifier (given names) separated by `<<`;
`<` inside each part is a space. A name field with no trailing filler (last character not
`<`) is reported as **probably truncated**.

## Dates and sex

- Dates are `YYMMDD`. Unknown parts may be filled with `<` on some documents; the parser
  reports them as unknown rather than guessing.
- Sex: `M`, `F`, `<` (unspecified). `X` is accepted as unspecified, with a warning.

## Special codes

Accepted in issuing state and nationality, besides ISO 3166-1 alpha-3:
`D` (Germany, written `D<<`), `GBD`, `GBN`, `GBO`, `GBP`, `GBS`, `UNO`, `UNA`, `UNK`,
`XXA`, `XXB`, `XXC`, `XXX`, `EUE`, `XOM`, `XPO`, `XBA`, `XIM`, `XCC`, `XCE`, `XCO`, `XEC`,
`XDC`, `XES`, `RKS` and the specimen state `UTO`.

## Details to verify against the official text

Each of these was implemented from general knowledge and should be checked against the
current edition of Doc 9303 before the `beta` flag is removed:

1. **Field offsets and lengths** for every format (all tables above), in particular:
   - TD3 personal number length (14) and the rule that its check digit may be `<`.
   - TD1 optional data 1 (15) and optional data 2 (11) lengths.
   - TD2 optional data length (7); MRV-A (16) and MRV-B (8) optional data lengths.
2. **Composite check digit fields per format**:
   - TD3: line 2 `[0,10) + [13,20) + [21,43)`.
   - TD1: line 1 `[5,30)` + line 2 `[0,7) + [8,15) + [18,29)`.
   - TD2: line 2 `[0,10) + [13,20) + [21,35)`.
   - MRV-A / MRV-B: no composite check digit.
3. **TD1 long document number rule** (position 14 `<`, overflow + check digit in
   optional data 1, terminated by `<`) and whether TD2 uses the same rule.
4. **Check digit on all-filler fields** (TD3 personal number `<` vs `0`).
5. **Sex codes**: whether `X` is permitted in the current edition.
6. **Document codes**: allowed first letters per format (`P`; `I`, `A`, `C`; `V`) and
   the meaning of the second character.
7. **Name rules**: truncation conventions and transliteration (Part 3 tables).
8. **Special nationality/issuing codes** list above (completeness and exact meanings).
9. **Unknown date parts** representation.
10. The 6 specimen MRZs used in `packages/core/test/specimens.test.ts` (recalled from
    Doc 9303 and the widely reproduced "ERIKSSON / UTO" examples; every check digit was
    verified computationally, but the text itself was not compared with the official
    document).
