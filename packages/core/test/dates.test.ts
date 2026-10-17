import { describe, expect, it } from 'vitest';
import { parseMrz } from '../src/index.js';
import { parseMrzDate, addMonths, ageInYears, toSimpleDate } from '../src/dates.js';
import { generateMrz } from '../src/generate/index.js';

const ref = { year: 2026, month: 10, day: 17 };

describe('century inference', () => {
  it.each([
    ['740812', 'birth', '1974-08-12'],
    ['261017', 'birth', '2026-10-17'], // born on the reference date
    ['261018', 'birth', '1926-10-18'], // one day later → previous century
    ['000101', 'birth', '2000-01-01'],
    ['991231', 'birth', '1999-12-31'],
    ['000229', 'birth', '2000-02-29'], // 2000 is a leap year
    ['120415', 'expiry', '2012-04-15'],
    ['461231', 'expiry', '2046-12-31'], // exactly 20 years ahead
    ['470101', 'expiry', '1947-01-01'], // more than 20 years ahead
    ['961210', 'expiry', '1996-12-10'],
    ['300229', 'expiry', null], // 2030 is not a leap year
    ['281301', 'expiry', null], // month 13
    ['280100', 'expiry', null], // day 0
    ['280431', 'birth', null], // 31 April
  ] as const)('%s (%s) → %s', (raw, kind, iso) => {
    expect(parseMrzDate(raw, kind, ref).iso).toBe(iso);
  });

  it('honours expiryMaxYearsAhead', () => {
    expect(parseMrzDate('400101', 'expiry', ref, 10).iso).toBe('1940-01-01');
    expect(parseMrzDate('400101', 'expiry', ref, 20).iso).toBe('2040-01-01');
  });

  it('flags missing and partially unknown dates', () => {
    expect(parseMrzDate('<<<<<<', 'birth', ref).status).toBe('missing');
    expect(parseMrzDate('74<<<<', 'birth', ref).status).toBe('unknown');
    expect(parseMrzDate('74AB12', 'birth', ref).status).toBe('invalid');
  });

  it('uses the referenceDate option', () => {
    const g = generateMrz({ format: 'TD3', seed: 9, overrides: { birthDate: '2025-05-05' } });
    expect(parseMrz(g.lines, { referenceDate: '2026-01-01' }).fields.birthDate).toBe('2025-05-05');
    expect(parseMrz(g.lines, { referenceDate: '2025-05-04' }).fields.birthDate).toBe('1925-05-05');
    expect(
      parseMrz(g.lines, { referenceDate: new Date(Date.UTC(2025, 4, 5)) }).fields.birthDate,
    ).toBe('2025-05-05');
  });

  it('reports invalid dates as errors and missing dates as warnings', () => {
    const g = generateMrz({ format: 'TD1', seed: 4 });
    const bad = [g.lines[0]!, '991399' + g.lines[1]!.slice(6), g.lines[2]!];
    const r = parseMrz(bad, { referenceDate: '2026-10-17', correct: false });
    expect(r.errors.map((e) => e.code)).toContain('invalid_date');
  });
});

describe('date helpers', () => {
  it('addMonths clamps to month end', () => {
    expect(addMonths({ year: 2026, month: 8, day: 31 }, 6)).toEqual({
      year: 2027,
      month: 2,
      day: 28,
    });
    expect(addMonths({ year: 2027, month: 8, day: 31 }, 6)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(addMonths({ year: 2026, month: 12, day: 20 }, 6)).toEqual({
      year: 2027,
      month: 6,
      day: 20,
    });
  });
  it('ageInYears counts birthdays', () => {
    expect(ageInYears({ year: 2014, month: 12, day: 16 }, { year: 2026, month: 12, day: 15 })).toBe(
      11,
    );
    expect(ageInYears({ year: 2014, month: 12, day: 15 }, { year: 2026, month: 12, day: 15 })).toBe(
      12,
    );
  });
  it('toSimpleDate rejects invalid input', () => {
    expect(toSimpleDate('2026-02-30')).toBeNull();
    expect(toSimpleDate('nope')).toBeNull();
    expect(toSimpleDate(new Date('invalid'))).toBeNull();
  });
});
