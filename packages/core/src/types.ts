/** MRZ formats defined by ICAO Doc 9303. */
export type MrzFormat = 'TD1' | 'TD2' | 'TD3' | 'MRVA' | 'MRVB';

/** Character class of an MRZ position, used to restrict OCR corrections. */
export type CharClass = 'digit' | 'alpha' | 'alnum';

/** Raw fields as laid out in the MRZ. */
export type RawField =
  | 'documentCode'
  | 'issuingState'
  | 'name'
  | 'documentNumber'
  | 'documentNumberCheckDigit'
  | 'nationality'
  | 'birthDate'
  | 'birthDateCheckDigit'
  | 'sex'
  | 'expiryDate'
  | 'expiryDateCheckDigit'
  | 'personalNumber'
  | 'personalNumberCheckDigit'
  | 'optionalData1'
  | 'optionalData2'
  | 'compositeCheckDigit';

export type CheckName =
  'documentNumber' | 'birthDate' | 'expiryDate' | 'personalNumber' | 'composite';

export type DocumentType = 'passport' | 'id-card' | 'visa' | 'other';

export type Sex = 'M' | 'F' | 'X' | null;

export interface Issue {
  /** Stable machine-readable code, e.g. `check_digit_failed`. */
  code: string;
  /** Human-readable explanation. */
  message: string;
  /** Field the issue relates to, when applicable. */
  field?: string;
}

export interface CheckResult {
  name: CheckName;
  valid: boolean;
  /** Check digit computed from the (possibly corrected) data, or null if not computable. */
  computed: number | null;
  /** Character printed in the check digit position. */
  printed: string;
  /** True when a correction was needed to make this check pass. */
  corrected: boolean;
}

export interface CharChange {
  line: number;
  position: number;
  from: string;
  to: string;
}

export type CorrectionReason =
  'character-class' | 'check-digit' | 'check-digit+composite' | 'composite' | 'filler';

export interface Correction {
  field: RawField;
  reason: CorrectionReason;
  /** Field value before correction. */
  original: string;
  /** Field value after correction. */
  corrected: string;
  changes: CharChange[];
}

export interface Ambiguity {
  check: CheckName;
  field: RawField;
  original: string;
  /** Equally plausible field values, none of which was applied. */
  candidates: string[];
}

export interface CountryInfo {
  code: string;
  name: string | null;
  kind: 'iso' | 'icao' | 'unknown';
}

export interface MrzFields {
  documentCode: string | null;
  documentType: DocumentType | null;
  issuingState: string | null;
  issuingStateName: string | null;
  surname: string | null;
  givenNames: string | null;
  /** True when the name field is completely filled, i.e. the name was probably truncated. */
  nameTruncated: boolean;
  documentNumber: string | null;
  nationality: string | null;
  nationalityName: string | null;
  /** ISO date `YYYY-MM-DD`, or null when missing/invalid. */
  birthDate: string | null;
  birthDateRaw: string | null;
  sex: Sex;
  expiryDate: string | null;
  expiryDateRaw: string | null;
  /** TD3 personal number / optional data (fillers removed). */
  personalNumber: string | null;
  optionalData1: string | null;
  optionalData2: string | null;
}

export interface MrzResult {
  /** True when there are no errors (all check digits pass, dates valid, format recognized). */
  valid: boolean;
  format: MrzFormat | null;
  /** Always true until the layouts are verified against the official Doc 9303 text. */
  beta: true;
  /** Normalized input lines, before correction. */
  input: string[];
  /** Lines after correction. */
  lines: string[];
  fields: MrzFields;
  checks: CheckResult[];
  corrections: Correction[];
  ambiguities: Ambiguity[];
  errors: Issue[];
  warnings: Issue[];
}

export interface ParseOptions {
  /** Reference date for century inference. Default: now. */
  referenceDate?: Date | string;
  /** Expiry dates more than this many years after the reference date are put in the 1900s. Default 20. */
  expiryMaxYearsAhead?: number;
  /** Attempt checksum-guided OCR correction. Default true. */
  correct?: boolean;
  /** Maximum substitutions per field in the check-digit search. Default 2. */
  maxSubstitutions?: number;
}
