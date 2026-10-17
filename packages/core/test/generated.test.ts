import { describe, expect, it } from 'vitest';
import { parseMrz, type MrzFormat } from '../src/index.js';
import { buildMrz, generateMrz } from '../src/generate/index.js';
import { REF } from './fixtures.js';

const FORMATS: MrzFormat[] = ['TD1', 'TD2', 'TD3', 'MRVA', 'MRVB'];
const LENGTHS: Record<MrzFormat, [number, number]> = {
  TD1: [3, 30],
  TD2: [2, 36],
  TD3: [2, 44],
  MRVA: [2, 44],
  MRVB: [2, 36],
};

describe.each(FORMATS)('generated %s documents', (format) => {
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('seed %i round-trips', (seed) => {
    const g = generateMrz({ format, seed });
    const [count, length] = LENGTHS[format];
    expect(g.lines).toHaveLength(count);
    for (const l of g.lines) expect(l).toHaveLength(length);
    const r = parseMrz(g.lines, { referenceDate: REF });
    expect(r.errors).toEqual([]);
    expect(r.format).toBe(format);
    expect(r.corrections).toEqual([]);
    expect(r.fields.documentNumber).toBe(g.document.documentNumber);
    expect(r.fields.birthDate).toBe(g.document.birthDate);
    expect(r.fields.expiryDate).toBe(g.document.expiryDate);
    expect(r.fields.issuingState).toBe(g.document.issuingState);
    expect(r.fields.nationality).toBe(g.document.nationality);
    expect(r.fields.sex).toBe(g.document.sex === '<' ? null : g.document.sex);
    if (!r.fields.nameTruncated) {
      expect(r.fields.surname).toBe(g.document.surname);
      expect(r.fields.givenNames ?? '').toBe(g.document.givenNames);
    }
  });
});

describe('long document numbers', () => {
  it.each(['TD1', 'TD2'] as const)('%s encodes and decodes a 12-character number', (format) => {
    const g = generateMrz({
      format,
      seed: 5,
      overrides: { documentNumber: 'AB1234567890', optionalData1: '' },
    });
    const r = parseMrz(g.lines, { referenceDate: REF });
    expect(r.errors).toEqual([]);
    expect(r.fields.documentNumber).toBe('AB1234567890');
    expect(r.lines[format === 'TD1' ? 0 : 1]).toContain('AB1234567<');
  });

  it('keeps optional data after the long number terminator (TD1)', () => {
    const g = generateMrz({
      format: 'TD1',
      seed: 6,
      overrides: { documentNumber: 'XY987654321', optionalData1: 'EXTRA7' },
    });
    const r = parseMrz(g.lines, { referenceDate: REF });
    expect(r.valid).toBe(true);
    expect(r.fields.documentNumber).toBe('XY987654321');
    expect(r.fields.optionalData1).toBe('EXTRA7');
  });

  it('buildMrz is deterministic', () => {
    const g = generateMrz({ seed: 42, format: 'TD3' });
    expect(buildMrz('TD3', g.document)).toEqual(g.lines);
    expect(generateMrz({ seed: 42, format: 'TD3' }).lines).toEqual(g.lines);
  });
});
