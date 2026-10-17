import {
  addMonths,
  ageInYears,
  compareDates,
  toIso,
  toSimpleDate,
  type SimpleDate,
} from '../dates.js';
import type { MrzResult } from '../types.js';

type DateInput = Date | string;

/** Minimal shape needed by the travel checks; a full `MrzResult` works. */
export type MrzLike = Pick<MrzResult, 'valid' | 'fields'>;

export interface TravelValidityOptions {
  travelDate: DateInput;
  returnDate?: DateInput;
  /** Months of validity required after the return (or travel) date. Default 6. */
  minMonthsValidity?: number;
}

export type TravelRule =
  'min_validity' | 'expired_before_travel' | 'expiry_unknown' | 'invalid_travel_dates';

export interface TravelValidity {
  ok: boolean;
  rule: TravelRule;
  message: string;
  expiryDate: string | null;
  travelDate: string | null;
  returnDate: string | null;
  /** Earliest acceptable expiry date. */
  requiredUntil: string | null;
  /** False when the MRZ itself did not validate (dates may be misread). */
  mrzValid: boolean;
}

/**
 * Check that the document is valid for the trip: not expired on the travel date and valid
 * for at least `minMonthsValidity` months after the return date (or travel date).
 */
export function validForTravel(result: MrzLike, options: TravelValidityOptions): TravelValidity {
  const months = options.minMonthsValidity ?? 6;
  const travel = toSimpleDate(options.travelDate);
  const ret = options.returnDate != null ? toSimpleDate(options.returnDate) : null;
  const expiry = toSimpleDate(result.fields.expiryDate);
  const base = {
    expiryDate: expiry ? toIso(expiry) : null,
    travelDate: travel ? toIso(travel) : null,
    returnDate: ret ? toIso(ret) : null,
    mrzValid: result.valid,
  };
  if (!travel || (options.returnDate != null && !ret) || (ret && compareDates(ret, travel) < 0)) {
    return {
      ...base,
      ok: false,
      rule: 'invalid_travel_dates',
      requiredUntil: null,
      message: !travel
        ? 'The travel date is missing or invalid (use YYYY-MM-DD).'
        : !ret
          ? 'The return date is invalid (use YYYY-MM-DD).'
          : `The return date ${toIso(ret)} is before the travel date ${toIso(travel)}.`,
    };
  }
  if (!expiry) {
    return {
      ...base,
      ok: false,
      rule: 'expiry_unknown',
      requiredUntil: null,
      message: 'The expiry date could not be read from the MRZ.',
    };
  }
  const anchor: SimpleDate = ret ?? travel;
  const anchorLabel = ret ? 'return date' : 'travel date';
  const required = addMonths(anchor, months);
  const e = toIso(expiry);
  if (compareDates(expiry, travel) < 0) {
    return {
      ...base,
      ok: false,
      rule: 'expired_before_travel',
      requiredUntil: toIso(required),
      message: `Expires ${e}, which is before the travel date ${toIso(travel)}.`,
    };
  }
  const plural = months === 1 ? 'month' : 'months';
  if (compareDates(expiry, required) < 0) {
    return {
      ...base,
      ok: false,
      rule: 'min_validity',
      requiredUntil: toIso(required),
      message: `Expires ${e}, which is less than ${months} ${plural} after ${anchorLabel} ${toIso(anchor)}.`,
    };
  }
  return {
    ...base,
    ok: true,
    rule: 'min_validity',
    requiredUntil: toIso(required),
    message: `Expires ${e}, at least ${months} ${plural} after ${anchorLabel} ${toIso(anchor)} (required until ${toIso(required)}).`,
  };
}

export type PassengerTypeCode = 'ADT' | 'CHD' | 'INF';

export interface PassengerTypeOptions {
  returnDate?: DateInput;
  /** Infant when younger than this (years). Default 2. */
  infantUnder?: number;
  /** Child when younger than this (years) and not an infant. Default 12 (i.e. ages 2–11). */
  childUnder?: number;
}

export interface PassengerTypeResult {
  type: PassengerTypeCode | null;
  age: number | null;
  returnType: PassengerTypeCode | null;
  returnAge: number | null;
  /** True when the type differs between outbound and return. */
  changes: boolean;
  note: string | null;
}

function typeForAge(age: number, infantUnder: number, childUnder: number): PassengerTypeCode {
  if (age < infantUnder) return 'INF';
  if (age < childUnder) return 'CHD';
  return 'ADT';
}

/** Passenger type by age on the travel date (and return date, if given). */
export function passengerType(
  dob: DateInput | null | undefined,
  travelDate: DateInput,
  options: PassengerTypeOptions = {},
): PassengerTypeResult {
  const infantUnder = options.infantUnder ?? 2;
  const childUnder = options.childUnder ?? 12;
  const birth = toSimpleDate(dob ?? null);
  const travel = toSimpleDate(travelDate);
  const ret = options.returnDate != null ? toSimpleDate(options.returnDate) : null;
  const empty = { type: null, age: null, returnType: null, returnAge: null, changes: false };
  if (!birth) return { ...empty, note: 'Date of birth is missing or invalid.' };
  if (!travel) return { ...empty, note: 'Travel date is missing or invalid.' };
  const age = ageInYears(birth, travel);
  if (age < 0) return { ...empty, note: 'Date of birth is after the travel date.' };
  const type = typeForAge(age, infantUnder, childUnder);
  if (!ret) return { type, age, returnType: null, returnAge: null, changes: false, note: null };
  const returnAge = ageInYears(birth, ret);
  const returnType = typeForAge(returnAge, infantUnder, childUnder);
  const changes = returnType !== type;
  return {
    type,
    age,
    returnType,
    returnAge,
    changes,
    note: changes
      ? `Passenger is ${type} (age ${age}) on ${toIso(travel)} but ${returnType} (age ${returnAge}) on return ${toIso(ret)}.`
      : null,
  };
}

export type Title = 'MR' | 'MRS' | 'MS' | 'MSTR' | 'MISS';

export interface TitleRules {
  adultMale: Title;
  adultFemale: Title;
  childMale: Title;
  childFemale: Title;
  infantMale: Title;
  infantFemale: Title;
}

export const DEFAULT_TITLES: TitleRules = {
  adultMale: 'MR',
  adultFemale: 'MS',
  childMale: 'MSTR',
  childFemale: 'MISS',
  infantMale: 'MSTR',
  infantFemale: 'MISS',
};

export interface AirlineNameOptions extends PassengerTypeOptions {
  /** Used to choose adult/child titles. Default: today. */
  travelDate?: DateInput;
  titles?: Partial<TitleRules>;
  /** Append the title. Default true. */
  includeTitle?: boolean;
  /** Remove spaces inside the surname (some systems require it). Default false. */
  removeSurnameSpaces?: boolean;
  /** What to write when there are no given names. Default 'empty'. */
  missingGivenName?: 'empty' | 'repeat-surname' | 'FNU';
  /** Maximum length of the whole string; given names are cut to fit. */
  maxLength?: number;
}

export interface AirlineName {
  name: string;
  surname: string;
  givenNames: string;
  title: Title | null;
  warnings: string[];
}

/** Format a name as `SURNAME/GIVEN MIDDLE TITLE` for airline bookings. */
export function airlineName(result: MrzLike, options: AirlineNameOptions = {}): AirlineName {
  const warnings: string[] = [];
  const f = result.fields;
  let surname = (f.surname ?? '').trim();
  if (options.removeSurnameSpaces) surname = surname.replace(/\s+/g, '');
  let given = (f.givenNames ?? '').trim();
  if (!surname) warnings.push('No surname in the MRZ.');
  if (!given) {
    const mode = options.missingGivenName ?? 'empty';
    if (mode === 'FNU') given = 'FNU';
    else if (mode === 'repeat-surname') given = surname;
    warnings.push(
      'No given names in the MRZ; check the airline’s rule for single-name passengers.',
    );
  }
  if (f.nameTruncated) {
    warnings.push(
      'The MRZ name field is full, so the name may be truncated. Use the full name from the visual zone.',
    );
  }

  let title: Title | null = null;
  if (options.includeTitle !== false) {
    const rules = { ...DEFAULT_TITLES, ...options.titles };
    const pt = passengerType(f.birthDate, options.travelDate ?? new Date(), options);
    const group = pt.type === 'INF' ? 'infant' : pt.type === 'CHD' ? 'child' : 'adult';
    if (!pt.type) warnings.push(`Title based on adult rules: ${pt.note}`);
    if (f.sex === 'M') title = rules[`${group}Male`];
    else if (f.sex === 'F') title = rules[`${group}Female`];
    else warnings.push('Sex is not M or F, so no title was added.');
  }

  const compose = () => `${surname}/${[given, title].filter(Boolean).join(' ')}`;
  let name = compose();
  if (options.maxLength && name.length > options.maxLength) {
    const room = options.maxLength - surname.length - 1 - (title ? title.length + 1 : 0);
    given = room > 0 ? given.slice(0, room).trim() : '';
    name = compose().slice(0, options.maxLength);
    warnings.push(`Name shortened to ${options.maxLength} characters.`);
  }
  return { name, surname, givenNames: given, title, warnings };
}

export interface PassengerOptions extends AirlineNameOptions {
  travelDate?: DateInput;
  returnDate?: DateInput;
}

/** Flat passenger record for CRM / spreadsheet import. */
export interface PassengerRecord {
  surname: string | null;
  givenNames: string | null;
  airlineName: string;
  title: Title | null;
  dateOfBirth: string | null;
  sex: 'M' | 'F' | 'X' | null;
  nationality: string | null;
  nationalityName: string | null;
  documentType: string | null;
  passportNumber: string | null;
  issuingCountry: string | null;
  issuingCountryName: string | null;
  expiryDate: string | null;
  passengerType: PassengerTypeCode | null;
  mrzValid: boolean;
  warnings: string[];
}

export function toPassenger(result: MrzLike, options: PassengerOptions = {}): PassengerRecord {
  const f = result.fields;
  const an = airlineName(result, options);
  const pt = passengerType(f.birthDate, options.travelDate ?? new Date(), options);
  const warnings = [...an.warnings];
  if (!result.valid)
    warnings.push('The MRZ did not validate; check every field against the document.');
  if (pt.note && !warnings.some((w) => w.includes(pt.note!))) warnings.push(pt.note);
  return {
    surname: f.surname,
    givenNames: f.givenNames,
    airlineName: an.name,
    title: an.title,
    dateOfBirth: f.birthDate,
    sex: f.sex,
    nationality: f.nationality,
    nationalityName: f.nationalityName,
    documentType: f.documentType,
    passportNumber: f.documentNumber,
    issuingCountry: f.issuingState,
    issuingCountryName: f.issuingStateName,
    expiryDate: f.expiryDate,
    passengerType: pt.type,
    mrzValid: result.valid,
    warnings,
  };
}
