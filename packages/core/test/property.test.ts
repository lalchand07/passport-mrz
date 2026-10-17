import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isValidCheckDigit, parseMrz, type MrzFormat } from '../src/index.js';
import { generateMrz, mutateOcr } from '../src/generate/index.js';
import { resolveCheck } from '../src/correct.js';
import { LAYOUTS } from '../src/formats.js';
import { REF } from './fixtures.js';

const FORMATS: MrzFormat[] = ['TD1', 'TD2', 'TD3', 'MRVA', 'MRVB'];
const mrzChar = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'.split(''));

describe('properties', () => {
  it('never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const r = parseMrz(s);
        expect(typeof r.valid).toBe('boolean');
      }),
      { numRuns: 500 },
    );
  });

  it('never throws on MRZ-shaped random lines', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS),
        fc.array(fc.string({ unit: mrzChar, minLength: 28, maxLength: 46 }), {
          minLength: 2,
          maxLength: 3,
        }),
        (_, lines) => {
          const r = parseMrz(lines, { referenceDate: REF });
          expect(r.errors.every((e) => e.code !== 'internal_error')).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('generated documents always parse valid', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FORMATS), fc.integer({ min: 0, max: 1e9 }), (format, seed) => {
        const r = parseMrz(generateMrz({ format, seed }).lines, { referenceDate: REF });
        expect(r.errors).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('corrected outputs always have valid check digits', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS),
        fc.integer({ min: 0, max: 1e9 }),
        fc.integer({ min: 1, max: 4 }),
        (format, seed, count) => {
          const g = generateMrz({ format, seed });
          const m = mutateOcr(g.lines, { seed, count, fillerErrors: true });
          const r = parseMrz(m.lines, { referenceDate: REF });
          const layout = LAYOUTS[r.format!];
          const changedBy = (reasons: string[]) =>
            new Set(
              r.corrections
                .filter((c) => reasons.includes(c.reason))
                .flatMap((c) => c.changes.map((x) => `${x.line}:${x.position}`)),
            );
          const fieldSearch = changedBy(['check-digit', 'check-digit+composite']);
          const compositeSearch = changedBy(['check-digit+composite', 'composite']);
          for (const check of layout.checks) {
            // A field fix must satisfy its own check; the composite must hold only when it
            // was used to choose the fix.
            const searched = check.ranges ? compositeSearch : fieldSearch;
            const rc = resolveCheck(layout, check, r.lines)!;
            if (![...rc.covered, rc.digit].some(([l, i]) => searched.has(`${l}:${i}`))) continue;
            const data = rc.covered.map(([l, i]) => r.lines[l]![i]).join('');
            expect(isValidCheckDigit(data, r.lines[rc.digit[0]]![rc.digit[1]]!)).toBe(true);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('a corrected result never reports a failed check as valid', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FORMATS), fc.integer({ min: 0, max: 1e9 }), (format, seed) => {
        const g = generateMrz({ format, seed });
        const m = mutateOcr(g.lines, { seed, count: 2 });
        const r = parseMrz(m.lines, { referenceDate: REF });
        expect(r.valid).toBe(r.errors.length === 0);
        expect(r.checks.every((c) => c.valid) || !r.valid).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
