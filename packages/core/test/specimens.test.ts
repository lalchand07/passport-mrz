import { describe, expect, it } from 'vitest';
import { parseMrz } from '../src/index.js';
import { REF, SPECIMENS } from './fixtures.js';

const parse = (lines: readonly string[]) => parseMrz(lines, { referenceDate: REF });

describe('ICAO specimens', () => {
  it.each(Object.entries(SPECIMENS))('%s parses with every check digit valid', (_, lines) => {
    const r = parse(lines);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.beta).toBe(true);
    expect(r.corrections).toEqual([]);
    expect(r.checks.every((c) => c.valid)).toBe(true);
  });

  it('TD3 passport fields', () => {
    const r = parse(SPECIMENS.td3);
    expect(r.format).toBe('TD3');
    expect(r.fields).toMatchObject({
      documentCode: 'P',
      documentType: 'passport',
      issuingState: 'UTO',
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      documentNumber: 'L898902C3',
      nationality: 'UTO',
      birthDate: '1974-08-12',
      sex: 'F',
      expiryDate: '2012-04-15',
      personalNumber: 'ZE184226B',
      nameTruncated: false,
    });
    expect(r.checks.map((c) => c.name)).toEqual([
      'documentNumber',
      'birthDate',
      'expiryDate',
      'personalNumber',
      'composite',
    ]);
    expect(r.warnings.map((w) => w.code)).toContain('document_expired');
  });

  it('TD1 ID card fields', () => {
    const r = parse(SPECIMENS.td1);
    expect(r.format).toBe('TD1');
    expect(r.fields).toMatchObject({
      documentType: 'id-card',
      documentNumber: 'D23145890',
      birthDate: '1974-08-12',
      expiryDate: '2012-04-15',
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      optionalData1: null,
      optionalData2: null,
    });
  });

  it('TD1 long document number', () => {
    const r = parse(SPECIMENS.td1Long);
    expect(r.fields.documentNumber).toBe('D23145890734');
    expect(r.fields.optionalData1).toBeNull();
    expect(r.fields).toMatchObject({ surname: 'STEVENSON', givenNames: 'PETER JOHN', sex: 'M' });
    expect(r.fields.birthDate).toBe('1934-07-12');
    expect(r.fields.expiryDate).toBe('1995-07-12');
  });

  it('TD2 fields', () => {
    const r = parse(SPECIMENS.td2);
    expect(r.format).toBe('TD2');
    expect(r.fields.documentNumber).toBe('D23145890');
    expect(r.checks.find((c) => c.name === 'composite')?.valid).toBe(true);
  });

  it('MRV-A visa fields', () => {
    const r = parse(SPECIMENS.mrva);
    expect(r.format).toBe('MRVA');
    expect(r.fields).toMatchObject({
      documentType: 'visa',
      documentNumber: 'L8988901C',
      nationality: 'XXX',
      nationalityName: 'Unspecified nationality',
      birthDate: '1940-09-07',
      expiryDate: '1996-12-10',
      optionalData1: '6ZE184226B',
    });
    expect(r.checks.map((c) => c.name)).toEqual(['documentNumber', 'birthDate', 'expiryDate']);
  });

  it('MRV-B visa fields', () => {
    const r = parse(SPECIMENS.mrvb);
    expect(r.format).toBe('MRVB');
    expect(r.fields.optionalData1).toBeNull();
    expect(r.checks).toHaveLength(3);
  });

  it('accepts the MRZ as one string with newlines or concatenated', () => {
    expect(parse([SPECIMENS.td3.join('\n')]).valid).toBe(true);
    expect(parseMrz(SPECIMENS.td3.join(''), { referenceDate: REF }).valid).toBe(true);
    expect(parseMrz(SPECIMENS.td1.join(''), { referenceDate: REF }).format).toBe('TD1');
    expect(parseMrz(SPECIMENS.td2.join(''), { referenceDate: REF }).format).toBe('TD2');
  });
});
