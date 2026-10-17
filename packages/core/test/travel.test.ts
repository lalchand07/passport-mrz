import { describe, expect, it } from 'vitest';
import { parseMrz } from '../src/index.js';
import { generateMrz } from '../src/generate/index.js';
import {
  airlineName,
  passengerType,
  toPassenger,
  validForTravel,
  type MrzLike,
} from '../src/travel/index.js';
import { REF, SPECIMENS } from './fixtures.js';

const doc = (overrides: NonNullable<Parameters<typeof generateMrz>[0]>['overrides'] = {}) =>
  parseMrz(generateMrz({ format: 'TD3', seed: 11, overrides }).lines, { referenceDate: REF });

describe('validForTravel', () => {
  it('fails when expiry is less than 6 months after the return date', () => {
    const v = validForTravel(doc({ expiryDate: '2027-03-02' }), {
      travelDate: '2026-12-15',
      returnDate: '2026-12-20',
    });
    expect(v.ok).toBe(false);
    expect(v.rule).toBe('min_validity');
    expect(v.message).toBe(
      'Expires 2027-03-02, which is less than 6 months after return date 2026-12-20.',
    );
    expect(v.requiredUntil).toBe('2027-06-20');
  });

  it('passes with enough validity', () => {
    const v = validForTravel(doc({ expiryDate: '2030-01-01' }), {
      travelDate: '2026-12-15',
      returnDate: '2026-12-20',
    });
    expect(v).toMatchObject({
      ok: true,
      rule: 'min_validity',
      expiryDate: '2030-01-01',
      requiredUntil: '2027-06-20',
    });
    expect(v.message).toContain('at least 6 months after return date 2026-12-20');
  });

  it('passes when expiry equals the required date', () => {
    expect(validForTravel(doc({ expiryDate: '2027-06-15' }), { travelDate: '2026-12-15' }).ok).toBe(
      true,
    );
    expect(validForTravel(doc({ expiryDate: '2027-06-14' }), { travelDate: '2026-12-15' }).ok).toBe(
      false,
    );
  });

  it('uses the travel date when no return date is given', () => {
    const v = validForTravel(doc({ expiryDate: '2027-05-01' }), { travelDate: '2026-12-15' });
    expect(v.message).toBe(
      'Expires 2027-05-01, which is less than 6 months after travel date 2026-12-15.',
    );
  });

  it('supports a custom minimum validity', () => {
    const d = doc({ expiryDate: '2027-03-02' });
    expect(validForTravel(d, { travelDate: '2026-12-15', minMonthsValidity: 3 }).ok).toBe(false);
    expect(validForTravel(d, { travelDate: '2026-12-15', minMonthsValidity: 2 }).ok).toBe(true);
    expect(validForTravel(d, { travelDate: '2026-12-15', minMonthsValidity: 1 }).message).toContain(
      '1 month after',
    );
    expect(validForTravel(d, { travelDate: '2026-12-15', minMonthsValidity: 0 }).ok).toBe(true);
  });

  it('reports expiry before travel', () => {
    const v = validForTravel(parseMrz(SPECIMENS.td3, { referenceDate: REF }), {
      travelDate: '2026-12-15',
    });
    expect(v.rule).toBe('expired_before_travel');
    expect(v.message).toBe('Expires 2012-04-15, which is before the travel date 2026-12-15.');
  });

  it('clamps month ends (31 Aug + 6 months = 28 Feb)', () => {
    const v = validForTravel(doc({ expiryDate: '2027-02-28' }), { travelDate: '2026-08-31' });
    expect(v.requiredUntil).toBe('2027-02-28');
    expect(v.ok).toBe(true);
  });

  it('rejects bad travel dates', () => {
    const d = doc();
    expect(validForTravel(d, { travelDate: 'soon' }).rule).toBe('invalid_travel_dates');
    expect(
      validForTravel(d, { travelDate: '2026-12-15', returnDate: '2026-12-01' }).message,
    ).toContain('before the travel date');
    expect(validForTravel(d, { travelDate: '2026-12-15', returnDate: 'x' }).rule).toBe(
      'invalid_travel_dates',
    );
  });

  it('handles an unknown expiry and accepts Date objects', () => {
    const r: MrzLike = { valid: false, fields: { ...doc().fields, expiryDate: null } };
    expect(validForTravel(r, { travelDate: new Date(Date.UTC(2026, 11, 15)) })).toMatchObject({
      ok: false,
      rule: 'expiry_unknown',
      mrzValid: false,
      travelDate: '2026-12-15',
    });
  });
});

describe('passengerType', () => {
  it.each([
    ['2025-01-01', 'INF', 1],
    ['2024-12-16', 'INF', 1], // turns 2 the day after travel
    ['2024-12-15', 'CHD', 2], // 2nd birthday on travel date
    ['2014-12-16', 'CHD', 11],
    ['2014-12-15', 'ADT', 12],
    ['1970-06-01', 'ADT', 56],
    ['2026-12-15', 'INF', 0], // born on travel date
  ] as const)('born %s → %s', (dob, type, age) => {
    expect(passengerType(dob, '2026-12-15')).toMatchObject({
      type,
      age,
      changes: false,
      note: null,
    });
  });

  it('notes a type change between outbound and return', () => {
    const p = passengerType('2014-12-20', '2026-12-15', { returnDate: '2027-01-05' });
    expect(p).toMatchObject({
      type: 'CHD',
      age: 11,
      returnType: 'ADT',
      returnAge: 12,
      changes: true,
    });
    expect(p.note).toBe(
      'Passenger is CHD (age 11) on 2026-12-15 but ADT (age 12) on return 2027-01-05.',
    );
  });

  it('infant becoming a child during the trip', () => {
    expect(passengerType('2024-12-20', '2026-12-15', { returnDate: '2026-12-25' })).toMatchObject({
      type: 'INF',
      returnType: 'CHD',
      changes: true,
    });
  });

  it('configurable thresholds', () => {
    expect(passengerType('2010-01-01', '2026-12-15', { childUnder: 18 }).type).toBe('CHD');
    expect(passengerType('2024-01-01', '2026-12-15', { infantUnder: 3 }).type).toBe('INF');
  });

  it('handles missing or impossible dates', () => {
    expect(passengerType(null, '2026-12-15').type).toBeNull();
    expect(passengerType('2027-01-01', '2026-12-15').note).toContain('after the travel date');
    expect(passengerType('2000-01-01', 'x').note).toContain('Travel date');
  });
});

describe('airlineName', () => {
  const travelDate = '2026-12-15';
  it.each([
    ['M', '1980-01-01', 'MR'],
    ['F', '1980-01-01', 'MS'],
    ['M', '2018-01-01', 'MSTR'],
    ['F', '2018-01-01', 'MISS'],
    ['M', '2026-01-01', 'MSTR'],
    ['F', '2026-01-01', 'MISS'],
  ] as const)('sex %s born %s → %s', (sex, birthDate, title) => {
    const r = doc({ sex, birthDate, surname: 'TESTER', givenNames: 'ANNA MARIA' });
    expect(airlineName(r, { travelDate }).name).toBe(`TESTER/ANNA MARIA ${title}`);
  });

  it('configurable title rules', () => {
    const r = doc({ sex: 'F', birthDate: '1980-01-01', surname: 'TESTER', givenNames: 'ANNA' });
    expect(airlineName(r, { travelDate, titles: { adultFemale: 'MRS' } }).name).toBe(
      'TESTER/ANNA MRS',
    );
    expect(airlineName(r, { travelDate, includeTitle: false }).name).toBe('TESTER/ANNA');
  });

  it('surname spaces and missing given names', () => {
    const r = doc({ sex: 'M', birthDate: '1980-01-01', surname: 'AL RASHID', givenNames: '' });
    expect(airlineName(r, { travelDate }).name).toBe('AL RASHID/MR');
    expect(
      airlineName(r, { travelDate, removeSurnameSpaces: true, missingGivenName: 'FNU' }).name,
    ).toBe('ALRASHID/FNU MR');
    expect(airlineName(r, { travelDate, missingGivenName: 'repeat-surname' }).name).toBe(
      'AL RASHID/AL RASHID MR',
    );
    expect(airlineName(r, { travelDate }).warnings[0]).toContain('No given names');
  });

  it('warns when the MRZ name may be truncated', () => {
    const r = doc({ surname: 'KARAMANLIDOUPAPADOPOULOU', givenNames: 'ALEXANDRA KONSTANTINA' });
    expect(airlineName(r, { travelDate }).warnings.join(' ')).toContain('truncated');
  });

  it('respects maxLength', () => {
    const r = doc({
      sex: 'M',
      birthDate: '1980-01-01',
      surname: 'TESTER',
      givenNames: 'MOHAMMED ABDULLAH',
    });
    const a = airlineName(r, { travelDate, maxLength: 20 });
    expect(a.name).toBe('TESTER/MOHAMMED A MR');
    expect(a.name.length).toBeLessThanOrEqual(20);
  });

  it('no title for unspecified sex', () => {
    const r = doc({ sex: '<', surname: 'TESTER', givenNames: 'SAM' });
    const a = airlineName(r, { travelDate });
    expect(a.name).toBe('TESTER/SAM');
    expect(a.title).toBeNull();
  });
});

describe('toPassenger', () => {
  it('returns a flat CRM record', () => {
    const r = doc({
      sex: 'F',
      birthDate: '1990-03-04',
      expiryDate: '2031-05-06',
      surname: 'TESTER',
      givenNames: 'ANNA',
      issuingState: 'SAU',
      nationality: 'SAU',
      documentNumber: 'X12345678',
    });
    expect(toPassenger(r, { travelDate: '2026-12-15' })).toEqual({
      surname: 'TESTER',
      givenNames: 'ANNA',
      airlineName: 'TESTER/ANNA MS',
      title: 'MS',
      dateOfBirth: '1990-03-04',
      sex: 'F',
      nationality: 'SAU',
      nationalityName: 'Saudi Arabia',
      documentType: 'passport',
      passportNumber: 'X12345678',
      issuingCountry: 'SAU',
      issuingCountryName: 'Saudi Arabia',
      expiryDate: '2031-05-06',
      passengerType: 'ADT',
      mrzValid: true,
      warnings: [],
    });
  });

  it('carries warnings for invalid MRZs and type changes', () => {
    const r = doc({ birthDate: '2014-12-20' });
    const invalid: MrzLike = { ...r, valid: false };
    const p = toPassenger(invalid, { travelDate: '2026-12-15', returnDate: '2027-01-05' });
    expect(p.warnings.join(' ')).toContain('did not validate');
    expect(p.warnings.join(' ')).toContain('CHD (age 11)');
  });
});
