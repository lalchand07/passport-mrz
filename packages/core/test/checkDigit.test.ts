import { describe, expect, it } from 'vitest';
import { charValue, computeCheckDigit, isValidCheckDigit } from '../src/index.js';

describe('check digits', () => {
  it.each([
    ['L898902C3', 6],
    ['740812', 2],
    ['120415', 9],
    ['ZE184226B<<<<<', 1],
    ['D23145890', 7],
    ['D23145890734', 9],
    ['L8988901C', 4],
    ['400907', 8],
    ['961210', 9],
    ['', 0],
    ['<<<<<<<<<', 0],
    ['000000', 0],
  ])('computes %s → %i', (data, digit) => {
    expect(computeCheckDigit(data)).toBe(digit);
  });

  it('maps character values', () => {
    expect(charValue('0')).toBe(0);
    expect(charValue('9')).toBe(9);
    expect(charValue('A')).toBe(10);
    expect(charValue('Z')).toBe(35);
    expect(charValue('<')).toBe(0);
    expect(charValue('a')).toBe(-1);
  });

  it('returns null for invalid characters', () => {
    expect(computeCheckDigit('AB-12')).toBeNull();
    expect(computeCheckDigit('ab')).toBeNull();
  });

  it('accepts < as check digit only for all-filler data', () => {
    expect(isValidCheckDigit('<<<<<<<<<<<<<<', '<')).toBe(true);
    expect(isValidCheckDigit('ZE184226B<<<<<', '<')).toBe(false);
    expect(isValidCheckDigit('ZE184226B<<<<<', '1')).toBe(true);
    expect(isValidCheckDigit('ZE184226B<<<<<', 'A')).toBe(false);
  });
});
