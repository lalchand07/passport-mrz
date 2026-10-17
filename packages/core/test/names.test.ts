import { describe, expect, it } from 'vitest';
import { parseMrz, parseName } from '../src/index.js';
import { generateMrz } from '../src/generate/index.js';
import { REF } from './fixtures.js';

describe('names', () => {
  it.each([
    ['ERIKSSON<<ANNA<MARIA<<<<<<<<<<', 'ERIKSSON', 'ANNA MARIA', false],
    ['AL<RASHID<<MOHAMMED<<<<<<<<<<<', 'AL RASHID', 'MOHAMMED', false],
    ['SINGLENAME<<<<<<<<<<<<<<<<<<<<', 'SINGLENAME', '', false],
    ['NOGIVEN<<<<<<<<<<<<<<<<<<<<<<<', 'NOGIVEN', '', false],
    ['VERYLONGSURNAMEXX<<GIVENNAMEXX', 'VERYLONGSURNAMEXX', 'GIVENNAMEXX', true],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZABCD', 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCD', '', true],
    ['<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<', '', '', false],
    ['DE<LA<CRUZ<<JUAN<<<<<<<<<<<<<<', 'DE LA CRUZ', 'JUAN', false],
  ])('%s', (field, surname, given, truncated) => {
    expect(parseName(field)).toEqual({ surname, givenNames: given, truncated });
  });

  it('warns about probable truncation', () => {
    const g = generateMrz({
      format: 'TD3',
      seed: 3,
      overrides: { surname: 'KARAMANLIDOUPAPADOPOULOU', givenNames: 'ALEXANDRA KONSTANTINA MARIA' },
    });
    const r = parseMrz(g.lines, { referenceDate: REF });
    expect(r.valid).toBe(true);
    expect(r.fields.nameTruncated).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('name_truncated');
    expect(r.fields.surname).toBe('KARAMANLIDOUPAPADOPOULOU');
    expect(r.fields.givenNames).toBe('ALEXANDRA KON');
  });

  it('name that exactly fills the field minus one character is not truncated', () => {
    const g = generateMrz({
      format: 'TD3',
      seed: 3,
      overrides: { surname: 'A'.repeat(30), givenNames: 'BBBBBB' },
    });
    expect(parseMrz(g.lines, { referenceDate: REF }).fields.nameTruncated).toBe(false);
  });
});
