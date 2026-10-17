import { expect, it } from 'vitest';
import { parseMrz } from '../src/index.js';
import { airlineName, passengerType, toPassenger, validForTravel } from '../src/travel/index.js';

// Keeps the README's 30-second example truthful.
it('README example', () => {
  const result = parseMrz(`P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
L8989O2C36UTO7408122F1204159ZE184226B<<<<<10`);
  expect(result.valid).toBe(true);
  expect(result.fields.documentNumber).toBe('L898902C3');
  expect(result.corrections[0]).toMatchObject({
    field: 'documentNumber',
    original: 'L8989O2C3',
    corrected: 'L898902C3',
    reason: 'check-digit',
  });
  expect(
    validForTravel(result, { travelDate: '2026-12-15', returnDate: '2026-12-20' }).message,
  ).toBe('Expires 2012-04-15, which is before the travel date 2026-12-15.');
  expect(passengerType(result.fields.birthDate, '2026-12-15').type).toBe('ADT');
  expect(airlineName(result, { travelDate: '2026-12-15' }).name).toBe('ERIKSSON/ANNA MARIA MS');
  expect(toPassenger(result, { travelDate: '2026-12-15' }).passportNumber).toBe('L898902C3');
});
