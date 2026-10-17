const WEIGHTS = [7, 3, 1] as const;

/** Numeric value of an MRZ character: 0-9, A=10 … Z=35, `<`=0. Returns -1 for invalid characters. */
export function charValue(c: string): number {
  if (c === '<') return 0;
  const code = c.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return code - 55;
  return -1;
}

/**
 * ICAO 9303 check digit (weights 7, 3, 1). Returns null if the input contains
 * characters outside `A-Z0-9<`.
 */
export function computeCheckDigit(data: string): number | null {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = charValue(data[i]!);
    if (v < 0) return null;
    sum += v * WEIGHTS[i % 3]!;
  }
  return sum % 10;
}

/**
 * True when `digit` is the correct check digit for `data`. A filler `<` is accepted
 * as check digit only when the data is entirely filler.
 */
export function isValidCheckDigit(data: string, digit: string): boolean {
  if (digit === '<') return /^<*$/.test(data);
  if (!/^[0-9]$/.test(digit)) return false;
  return computeCheckDigit(data) === Number(digit);
}
