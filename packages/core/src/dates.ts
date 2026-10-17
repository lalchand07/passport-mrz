export interface SimpleDate {
  year: number;
  month: number;
  day: number;
}

export function toIso(d: SimpleDate): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function compareDates(a: SimpleDate, b: SimpleDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Parse `YYYY-MM-DD` (or a Date, using its UTC calendar date). Returns null when invalid. */
export function toSimpleDate(value: Date | string | undefined | null): SimpleDate | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const d = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (d.month < 1 || d.month > 12 || d.day < 1 || d.day > daysInMonth(d.year, d.month)) return null;
  return d;
}

/** Add calendar months, clamping the day to the end of the target month. */
export function addMonths(d: SimpleDate, months: number): SimpleDate {
  const total = d.year * 12 + (d.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) };
}

/** Full years between `from` and `to`. */
export function ageInYears(from: SimpleDate, to: SimpleDate): number {
  let age = to.year - from.year;
  if (to.month < from.month || (to.month === from.month && to.day < from.day)) age--;
  return age;
}

export type DateKind = 'birth' | 'expiry';

export type MrzDateResult =
  | { status: 'ok'; date: SimpleDate; iso: string }
  | { status: 'missing' | 'unknown' | 'invalid'; date: null; iso: null };

/**
 * Parse an MRZ `YYMMDD` date and infer the century relative to `reference`:
 * - birth dates: the latest century that is not after the reference date;
 * - expiry dates: the latest century not more than `maxYearsAhead` years after it.
 */
export function parseMrzDate(
  raw: string,
  kind: DateKind,
  reference: SimpleDate,
  maxYearsAhead = 20,
): MrzDateResult {
  if (/^<+$/.test(raw)) return { status: 'missing', date: null, iso: null };
  if (!/^\d{6}$/.test(raw))
    return { status: raw.includes('<') ? 'unknown' : 'invalid', date: null, iso: null };
  const yy = Number(raw.slice(0, 2));
  const month = Number(raw.slice(2, 4));
  const day = Number(raw.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > 31)
    return { status: 'invalid', date: null, iso: null };

  const base = Math.floor(reference.year / 100) * 100;
  const candidates = [base + 100 + yy, base + yy, base - 100 + yy];
  for (const year of candidates) {
    const date = { year, month, day };
    const fits =
      kind === 'birth'
        ? compareDates(date, reference) <= 0
        : year <= reference.year + maxYearsAhead;
    if (!fits) continue;
    // Validate against the chosen century (29 February depends on it).
    if (day > daysInMonth(year, month)) return { status: 'invalid', date: null, iso: null };
    return { status: 'ok', date, iso: toIso(date) };
  }
  return { status: 'invalid', date: null, iso: null };
}
