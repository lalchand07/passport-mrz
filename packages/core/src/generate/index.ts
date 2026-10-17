// Synthetic MRZ generator for tests and demos. Everything it produces is invented:
// names are built from random syllables, numbers are random. Never use real passport data.
import { computeCheckDigit } from '../checkDigit.js';
import { ISO_COUNTRIES } from '../data/countries.js';
import { DIGIT_FOR_LETTER, LETTERS_FOR_DIGIT } from '../correct.js';
import { LAYOUTS } from '../formats.js';
import type { MrzFormat } from '../types.js';

export type Rng = () => number;

/** Deterministic PRNG (mulberry32). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticDocument {
  documentCode: string;
  issuingState: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  /** ISO date `YYYY-MM-DD`. */
  birthDate: string;
  sex: 'M' | 'F' | '<';
  /** ISO date `YYYY-MM-DD`. */
  expiryDate: string;
  /** TD3 only. */
  personalNumber: string;
  /** TD1, TD2, MRV-A, MRV-B. */
  optionalData1: string;
  /** TD1 only. */
  optionalData2: string;
}

const SYLLABLES = [
  'KA',
  'RO',
  'MI',
  'LEN',
  'TOR',
  'VA',
  'SI',
  'NOR',
  'BEL',
  'DRA',
  'FEN',
  'GU',
  'HAL',
  'JO',
  'KES',
  'LU',
  'MAR',
  'NE',
  'OS',
  'PRA',
  'QUI',
  'RAN',
  'SAL',
  'TEM',
  'UL',
  'VEN',
  'WIL',
  'XO',
  'YA',
  'ZEN',
];
const COUNTRY_CODES = Object.keys(ISO_COUNTRIES);
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/** An invented name made of 2-4 random syllables. */
export function inventName(rng: Rng): string {
  let s = '';
  for (let i = int(rng, 2, 4); i > 0; i--) s += pick(rng, SYLLABLES);
  return s;
}

function randomDate(rng: Rng, fromYear: number, toYear: number): string {
  const y = int(rng, fromYear, toYear);
  const m = int(rng, 1, 12);
  const d = int(rng, 1, new Date(Date.UTC(y, m, 0)).getUTCDate());
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function randomString(rng: Rng, length: number, alphabet = ALNUM): string {
  let s = '';
  for (let i = 0; i < length; i++) s += pick(rng, [...alphabet]);
  return s;
}

const DOC_CODES: Record<MrzFormat, string[]> = {
  TD3: ['P<', 'PO', 'PD', 'PS'],
  TD1: ['I<', 'ID', 'AC', 'IR'],
  TD2: ['I<', 'ID', 'AC'],
  MRVA: ['V<', 'VS', 'VT'],
  MRVB: ['V<', 'VS', 'VT'],
};

export interface GenerateOptions {
  format?: MrzFormat;
  seed?: number;
  rng?: Rng;
  /** Year around which dates are generated. Default 2026. */
  referenceYear?: number;
  overrides?: Partial<SyntheticDocument>;
}

/** Create a random synthetic document (all data invented). */
export function randomDocument(
  options: GenerateOptions = {},
): SyntheticDocument & { format: MrzFormat } {
  const rng = options.rng ?? createRng(options.seed ?? 1);
  const format = options.format ?? pick(rng, ['TD1', 'TD2', 'TD3', 'MRVA', 'MRVB'] as const);
  const year = options.referenceYear ?? 2026;
  const state = pick(rng, COUNTRY_CODES);
  const given = Array.from({ length: int(rng, 1, 3) }, () => inventName(rng)).join(' ');
  const doc: SyntheticDocument = {
    documentCode: pick(rng, DOC_CODES[format]),
    issuingState: state,
    surname: rng() < 0.15 ? `${inventName(rng)} ${inventName(rng)}` : inventName(rng),
    givenNames: rng() < 0.05 ? '' : given,
    documentNumber: randomString(rng, 9),
    nationality: rng() < 0.85 ? state : pick(rng, COUNTRY_CODES),
    birthDate: randomDate(rng, year - 90, year - 1),
    sex: pick(rng, ['M', 'F', 'F', 'M', '<'] as const),
    expiryDate: randomDate(rng, year - 3, year + 10),
    personalNumber: rng() < 0.5 ? '' : randomString(rng, int(rng, 1, 14)),
    optionalData1:
      rng() < 0.5 ? '' : randomString(rng, int(rng, 1, LAYOUTS[format].format === 'TD1' ? 15 : 7)),
    optionalData2: rng() < 0.7 ? '' : randomString(rng, int(rng, 1, 11)),
  };
  return { ...doc, ...options.overrides, format };
}

const mrzText = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '<');
const yymmdd = (iso: string) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
const fit = (s: string, n: number) => s.slice(0, n).padEnd(n, '<');
const cd = (s: string) => String(computeCheckDigit(s) ?? 0);

/** Encode the name as `SURNAME<<GIVEN<NAMES`, cut to `length`. */
export function encodeName(surname: string, givenNames: string, length: number): string {
  const name = givenNames ? `${mrzText(surname)}<<${mrzText(givenNames)}` : mrzText(surname);
  return fit(name, length);
}

/**
 * Build MRZ lines with correct check digits from document data. Document numbers longer
 * than 9 characters use the TD1/TD2 long document number layout.
 */
export function buildMrz(format: MrzFormat, doc: SyntheticDocument): string[] {
  const code = fit(doc.documentCode, 2);
  const state = fit(doc.issuingState, 3);
  const nat = fit(doc.nationality, 3);
  const dob = yymmdd(doc.birthDate);
  const exp = yymmdd(doc.expiryDate);
  const num = mrzText(doc.documentNumber);
  const sex = doc.sex;

  const docField = (optLength: number, opt: string): [string, string] => {
    if (num.length <= 9 || format === 'TD3' || format === 'MRVA' || format === 'MRVB') {
      const n = fit(num, 9);
      return [n + cd(n), fit(mrzText(opt), optLength)];
    }
    const overflow = num.slice(9) + cd(num) + '<';
    return [num.slice(0, 9) + '<', fit(overflow + mrzText(opt), optLength)];
  };

  if (format === 'TD1') {
    const [docPart, opt1] = docField(15, doc.optionalData1);
    const l1 = code + state + docPart + opt1;
    const l2a = dob + cd(dob) + sex + exp + cd(exp) + nat + fit(mrzText(doc.optionalData2), 11);
    const composite = cd(l1.slice(5, 30) + l2a.slice(0, 7) + l2a.slice(8, 15) + l2a.slice(18, 29));
    return [l1, l2a + composite, encodeName(doc.surname, doc.givenNames, 30)];
  }
  const long = format === 'TD3' || format === 'MRVA';
  const l1 = code + state + encodeName(doc.surname, doc.givenNames, long ? 39 : 31);
  const optLength = format === 'TD3' ? 14 : format === 'TD2' ? 7 : format === 'MRVA' ? 16 : 8;
  const [docPart, opt] = docField(
    optLength,
    format === 'TD3' ? doc.personalNumber : doc.optionalData1,
  );
  let l2 = docPart + nat + dob + cd(dob) + sex + exp + cd(exp) + opt;
  if (format === 'TD3') {
    l2 += /^<+$/.test(opt) ? '<' : cd(opt);
    l2 += cd(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43));
  } else if (format === 'TD2') {
    l2 += cd(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35));
  }
  return [l1, l2];
}

export interface GeneratedMrz {
  format: MrzFormat;
  lines: string[];
  text: string;
  document: SyntheticDocument;
}

/** Generate a valid synthetic MRZ with correct check digits. */
export function generateMrz(options: GenerateOptions = {}): GeneratedMrz {
  const { format, ...document } = randomDocument(options);
  const lines = buildMrz(format, document);
  return { format, lines, text: lines.join('\n'), document };
}

export interface Mutation {
  line: number;
  position: number;
  from: string;
  to: string;
}

export interface MutateOptions {
  seed?: number;
  rng?: Rng;
  /** Number of substitutions. Default 1. */
  count?: number;
  /** Also turn fillers into `K` (a common OCR error). Default false. */
  fillerErrors?: boolean;
  /** Restrict mutations to these positions (`[line, index]`). */
  positions?: ReadonlyArray<readonly [number, number]>;
}

/** Apply OCR-style confusions (O/0, I/1, B/8, S/5, Z/2, G/6) to MRZ lines. */
export function mutateOcr(
  lines: readonly string[],
  options: MutateOptions = {},
): { lines: string[]; mutations: Mutation[] } {
  const rng = options.rng ?? createRng(options.seed ?? 1);
  const grid = lines.map((l) => [...l]);
  const confusable = (c: string): string[] => {
    const alts = [...(LETTERS_FOR_DIGIT[c]?.slice(0, 1) ?? [])];
    for (const [letter, digit] of Object.entries(DIGIT_FOR_LETTER)) {
      if (letter === c && 'OIZSGB'.includes(letter)) alts.push(digit);
    }
    if (c === '<' && options.fillerErrors) alts.push('K');
    return alts;
  };
  const all: ReadonlyArray<readonly [number, number]> =
    options.positions ?? grid.flatMap((row, l) => row.map((_, i) => [l, i] as const));
  const candidates = all.filter(([l, i]) => confusable(grid[l]?.[i] ?? '').length > 0);
  const mutations: Mutation[] = [];
  for (let n = 0; n < (options.count ?? 1) && candidates.length; n++) {
    const idx = Math.floor(rng() * candidates.length);
    const [l, i] = candidates.splice(idx, 1)[0]!;
    const from = grid[l]![i]!;
    const to = pick(rng, confusable(from));
    grid[l]![i] = to;
    mutations.push({ line: l, position: i, from, to });
  }
  return { lines: grid.map((r) => r.join('')), mutations };
}
