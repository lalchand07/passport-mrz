import type { CharClass, CheckName, MrzFormat, RawField } from './types.js';

export interface FieldDef {
  name: RawField;
  line: number;
  start: number;
  length: number;
  cls: CharClass;
}

export type Range = readonly [line: number, start: number, end: number];

export interface CheckDef {
  name: CheckName;
  /** Field holding the check digit. */
  digit: RawField;
  /** Field covered by the check (field checks). */
  field?: RawField;
  /** Ranges covered by the composite check. */
  ranges?: readonly Range[];
}

export interface Layout {
  format: MrzFormat;
  lineCount: number;
  lineLength: number;
  fields: readonly FieldDef[];
  checks: readonly CheckDef[];
}

// Layouts written from general knowledge of ICAO Doc 9303 — see docs/FORMAT_NOTES.md.
const f = (
  name: RawField,
  line: number,
  start: number,
  length: number,
  cls: CharClass,
): FieldDef => ({
  name,
  line,
  start,
  length,
  cls,
});

const fieldChecks: CheckDef[] = [
  { name: 'documentNumber', field: 'documentNumber', digit: 'documentNumberCheckDigit' },
  { name: 'birthDate', field: 'birthDate', digit: 'birthDateCheckDigit' },
  { name: 'expiryDate', field: 'expiryDate', digit: 'expiryDateCheckDigit' },
];

/** Line 2 of TD3 / MRV-A and TD2 / MRV-B share positions 0-27. */
const line2Common = (line: number): FieldDef[] => [
  f('documentNumber', line, 0, 9, 'alnum'),
  f('documentNumberCheckDigit', line, 9, 1, 'digit'),
  f('nationality', line, 10, 3, 'alpha'),
  f('birthDate', line, 13, 6, 'digit'),
  f('birthDateCheckDigit', line, 19, 1, 'digit'),
  f('sex', line, 20, 1, 'alpha'),
  f('expiryDate', line, 21, 6, 'digit'),
  f('expiryDateCheckDigit', line, 27, 1, 'digit'),
];

const line1Name = (length: number): FieldDef[] => [
  f('documentCode', 0, 0, 2, 'alpha'),
  f('issuingState', 0, 2, 3, 'alpha'),
  f('name', 0, 5, length, 'alpha'),
];

export const LAYOUTS: Readonly<Record<MrzFormat, Layout>> = {
  TD3: {
    format: 'TD3',
    lineCount: 2,
    lineLength: 44,
    fields: [
      ...line1Name(39),
      ...line2Common(1),
      f('personalNumber', 1, 28, 14, 'alnum'),
      f('personalNumberCheckDigit', 1, 42, 1, 'digit'),
      f('compositeCheckDigit', 1, 43, 1, 'digit'),
    ],
    checks: [
      ...fieldChecks,
      { name: 'personalNumber', field: 'personalNumber', digit: 'personalNumberCheckDigit' },
      {
        name: 'composite',
        digit: 'compositeCheckDigit',
        ranges: [
          [1, 0, 10],
          [1, 13, 20],
          [1, 21, 43],
        ],
      },
    ],
  },
  TD2: {
    format: 'TD2',
    lineCount: 2,
    lineLength: 36,
    fields: [
      ...line1Name(31),
      ...line2Common(1),
      f('optionalData1', 1, 28, 7, 'alnum'),
      f('compositeCheckDigit', 1, 35, 1, 'digit'),
    ],
    checks: [
      ...fieldChecks,
      {
        name: 'composite',
        digit: 'compositeCheckDigit',
        ranges: [
          [1, 0, 10],
          [1, 13, 20],
          [1, 21, 35],
        ],
      },
    ],
  },
  TD1: {
    format: 'TD1',
    lineCount: 3,
    lineLength: 30,
    fields: [
      f('documentCode', 0, 0, 2, 'alpha'),
      f('issuingState', 0, 2, 3, 'alpha'),
      f('documentNumber', 0, 5, 9, 'alnum'),
      f('documentNumberCheckDigit', 0, 14, 1, 'digit'),
      f('optionalData1', 0, 15, 15, 'alnum'),
      f('birthDate', 1, 0, 6, 'digit'),
      f('birthDateCheckDigit', 1, 6, 1, 'digit'),
      f('sex', 1, 7, 1, 'alpha'),
      f('expiryDate', 1, 8, 6, 'digit'),
      f('expiryDateCheckDigit', 1, 14, 1, 'digit'),
      f('nationality', 1, 15, 3, 'alpha'),
      f('optionalData2', 1, 18, 11, 'alnum'),
      f('compositeCheckDigit', 1, 29, 1, 'digit'),
      f('name', 2, 0, 30, 'alpha'),
    ],
    checks: [
      ...fieldChecks,
      {
        name: 'composite',
        digit: 'compositeCheckDigit',
        ranges: [
          [0, 5, 30],
          [1, 0, 7],
          [1, 8, 15],
          [1, 18, 29],
        ],
      },
    ],
  },
  MRVA: {
    format: 'MRVA',
    lineCount: 2,
    lineLength: 44,
    fields: [...line1Name(39), ...line2Common(1), f('optionalData1', 1, 28, 16, 'alnum')],
    checks: fieldChecks,
  },
  MRVB: {
    format: 'MRVB',
    lineCount: 2,
    lineLength: 36,
    fields: [...line1Name(31), ...line2Common(1), f('optionalData1', 1, 28, 8, 'alnum')],
    checks: fieldChecks,
  },
};

export function fieldDef(layout: Layout, name: RawField): FieldDef | undefined {
  return layout.fields.find((d) => d.name === name);
}

export function readField(lines: readonly string[], def: FieldDef): string {
  return (lines[def.line] ?? '').slice(def.start, def.start + def.length);
}
