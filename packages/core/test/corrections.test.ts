import { describe, expect, it } from 'vitest';
import { parseMrz } from '../src/index.js';
import { REF, SPECIMENS } from './fixtures.js';

const parse = (lines: readonly string[], opts = {}) =>
  parseMrz(lines, { referenceDate: REF, ...opts });
const swap = (line: string, pos: number, c: string) => line.slice(0, pos) + c + line.slice(pos + 1);

describe('character-class repairs', () => {
  it.each([
    ['O', '0', 13],
    ['I', '1', 18],
    ['B', '8', 16],
    ['S', '5', 25],
    ['Z', '2', 17],
    ['G', '6', 24],
  ])('letter %s in a date becomes %s', (letter, digit, pos) => {
    const original = SPECIMENS.td3[1];
    const changed = swap(original, pos, letter);
    // only replace where the original actually has the digit
    if (original[pos] !== digit) return;
    const r = parse([SPECIMENS.td3[0], changed]);
    expect(r.valid).toBe(true);
    expect(r.lines[1]).toBe(original);
    expect(r.corrections[0]).toMatchObject({ reason: 'character-class' });
  });

  it('repairs a letter in the birth date (O → 0)', () => {
    const r = parse([SPECIMENS.td3[0], 'L898902C36UTO74O8122F1204159ZE184226B<<<<<10']);
    expect(r.valid).toBe(true);
    expect(r.fields.birthDate).toBe('1974-08-12');
    expect(r.corrections).toEqual([
      {
        field: 'birthDate',
        reason: 'character-class',
        original: '74O812',
        corrected: '740812',
        changes: [{ line: 1, position: 15, from: 'O', to: '0' }],
      },
    ]);
  });

  it('repairs a letter in a check digit (S → 5 is not needed here, I → 1 is)', () => {
    const r = parse([
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
      'L898902C36UTO7408122F1204159ZE184226B<<<<<I0',
    ]);
    expect(r.valid).toBe(true);
    expect(r.corrections[0]?.field).toBe('personalNumberCheckDigit');
  });

  it('repairs a digit in the issuing state using the country list', () => {
    const r = parse(['P<UT0ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', SPECIMENS.td3[1]]);
    expect(r.valid).toBe(true);
    expect(r.fields.issuingState).toBe('UTO');
    expect(r.corrections[0]).toMatchObject({
      field: 'issuingState',
      original: 'UT0',
      corrected: 'UTO',
    });
  });

  it('repairs a digit in the nationality', () => {
    const r = parse([SPECIMENS.td3[0], 'L898902C36UT07408122F1204159ZE184226B<<<<<10']);
    expect(r.fields.nationality).toBe('UTO');
  });

  it('repairs digits in the name', () => {
    const r = parse(['P<UTOER1KSSON<<ANNA<MAR1A<<<<<<<<<<<<<<<<<<<', SPECIMENS.td3[1]]);
    expect(r.fields.surname).toBe('ERIKSSON');
    expect(r.fields.givenNames).toBe('ANNA MARIA');
    expect(r.corrections[0]).toMatchObject({ field: 'name', reason: 'character-class' });
  });

  it('repairs a digit in the document code', () => {
    const r = parse(['1<UTOD231458907<<<<<<<<<<<<<<<', ...SPECIMENS.td1.slice(1)]);
    expect(r.fields.documentCode).toBe('I');
  });

  it('turns K in the name filler back into <', () => {
    const r = parse(['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<K<<<<<<KK<<<', SPECIMENS.td3[1]]);
    expect(r.valid).toBe(true);
    expect(r.lines[0]).toBe(SPECIMENS.td3[0]);
    expect(r.corrections[0]).toMatchObject({ field: 'name', reason: 'filler' });
  });

  it('does not touch a K that is part of the name', () => {
    const r = parse(['P<UTOERIKSSON<<ANNA<K<<<<<<<<<<<<<<<<<<<<<<<', SPECIMENS.td3[1]]);
    expect(r.fields.givenNames).toBe('ANNA K');
    expect(r.corrections).toEqual([]);
  });
});

describe('check-digit guided corrections', () => {
  it('fixes O → 0 in a document number', () => {
    const r = parse([SPECIMENS.td3[0], 'L8989O2C36UTO7408122F1204159ZE184226B<<<<<10']);
    expect(r.valid).toBe(true);
    expect(r.fields.documentNumber).toBe('L898902C3');
    expect(r.corrections).toEqual([
      {
        field: 'documentNumber',
        reason: 'check-digit',
        original: 'L8989O2C3',
        corrected: 'L898902C3',
        changes: [{ line: 1, position: 5, from: 'O', to: '0' }],
      },
    ]);
    expect(r.checks.find((c) => c.name === 'documentNumber')).toMatchObject({
      valid: true,
      corrected: true,
    });
  });

  it('fixes K → < in the personal number filler', () => {
    const r = parse([SPECIMENS.td3[0], 'L898902C36UTO7408122F1204159ZE184226B<<K<<10']);
    expect(r.valid).toBe(true);
    expect(r.fields.personalNumber).toBe('ZE184226B');
    expect(r.corrections[0]).toMatchObject({ field: 'personalNumber', reason: 'filler' });
  });

  it('fixes K → < in TD1 optional data filler', () => {
    const r = parse(['I<UTOD231458907<<<<K<<<<<<<<<<', ...SPECIMENS.td1.slice(1)]);
    expect(r.valid).toBe(true);
    expect(r.fields.optionalData1).toBeNull();
  });

  it('fixes several independent errors at once', () => {
    const r = parse([
      'P<UT0ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<K<<<<',
      'L8989O2C36UTO74O8122F12O4159ZE184226B<<<<<10',
    ]);
    expect(r.valid).toBe(true);
    expect(r.lines).toEqual([...SPECIMENS.td3]);
    expect(r.corrections.map((c) => c.field).sort()).toEqual(
      ['birthDate', 'documentNumber', 'expiryDate', 'issuingState', 'name'].sort(),
    );
  });

  it('reports every correction as a warning too', () => {
    const r = parse([SPECIMENS.td3[0], 'L8989O2C36UTO7408122F1204159ZE184226B<<<<<10']);
    expect(r.warnings.filter((w) => w.code === 'corrected')).toHaveLength(1);
  });

  it('breaks a tie with the composite check (TD1 long document number)', () => {
    // The overflow sits at a different offset in the composite than in the document number
    // check, so the composite adds information there.
    const r = parse([
      'ACEGYD23145890<SSBZ4<<<<<<<<<<',
      '6502230<3006117EGYR018S<<<<<<0',
      'JONENOR<<TORKES<<<<<<<<<<<<<<<',
    ]);
    expect(r.valid).toBe(true);
    expect(r.fields.documentNumber).toBe('D23145890S5BZ');
    expect(r.corrections).toEqual([
      {
        field: 'optionalData1',
        reason: 'check-digit+composite',
        original: 'SSBZ4<<<<<<<<<<',
        corrected: 'S5BZ4<<<<<<<<<<',
        changes: [{ line: 0, position: 16, from: 'S', to: '5' }],
      },
    ]);
  });

  it('respects correct: false', () => {
    const r = parse([SPECIMENS.td3[0], 'L8989O2C36UTO7408122F1204159ZE184226B<<<<<10'], {
      correct: false,
    });
    expect(r.valid).toBe(false);
    expect(r.corrections).toEqual([]);
    expect(r.errors.map((e) => e.code)).toContain('check_digit_failed');
  });

  it('respects maxSubstitutions', () => {
    const line = 'L8989O2C36UTO7408122F1204159ZE184226B<<<<<10';
    expect(parse([SPECIMENS.td3[0], line]).valid).toBe(true);
    const r = parse([SPECIMENS.td3[0], line], { maxSubstitutions: 0 });
    expect(r.valid).toBe(false);
    expect(r.corrections).toEqual([]);
  });
});

describe('ambiguous corrections are not applied', () => {
  it('TD3 document number with three equally valid fixes', () => {
    const lines = [
      'PSLBNYATORGUQUI<<ULJOJOSI<ROZEN<LENGUGUJO<<<',
      'RKMNSB5BC8LBN4902054M2906195Q7I<<<<<<<<<<<10',
    ];
    const r = parse(lines);
    expect(r.valid).toBe(false);
    expect(r.lines).toEqual(lines);
    expect(r.ambiguities).toEqual([
      {
        check: 'documentNumber',
        field: 'documentNumber',
        original: 'RKMNSB5BC',
        candidates: ['RKMN5B5BC', 'RKMNSBSBC', 'RKMNSB58C'],
      },
    ]);
    expect(r.warnings.map((w) => w.code)).toContain('correction_ambiguous');
    expect(r.errors.map((e) => e.field)).toContain('documentNumber');
  });

  it('MRV-A document number', () => {
    const lines = [
      'VTFINSALKAXO<<YATORKA<<<<<<<<<<<<<<<<<<<<<<<',
      '50XT29IK69FIN7403057F2304090<<<<<<<<<<<<<<<<',
    ];
    const r = parse(lines);
    expect(r.ambiguities[0]?.candidates).toEqual(['S0XT29IK6', '50XT291K6']);
    expect(r.fields.documentNumber).toBe('50XT29IK6');
  });

  it('TD1 document number', () => {
    const lines = [
      'IDCRIAW08R2B740<<<<<<<<<<<<<<<',
      '6007045F2401209CRI<<<<<<<<<<<6',
      'NORRO<<NORGU<<<<<<<<<<<<<<<<<<',
    ];
    const r = parse(lines);
    expect(r.ambiguities[0]?.candidates.sort()).toEqual(['AW08RZB74', 'AWD8R2B74']);
  });

  it('TD2 document number', () => {
    const r = parse([
      'ACLBNYATORGUQUI<<ULJOJOSI<ROZEN<LENG',
      'RKMNSBS8C8LBN4902054M2906195EV5VA<<1',
    ]);
    expect(r.ambiguities).toHaveLength(1);
    expect(r.valid).toBe(false);
  });
});

describe('composite-only corrections', () => {
  it('TD1 optional data 2 (0 → O) with a warning', () => {
    const r = parse([
      'ACPRIV7QJWSRKZ5HR3VPN0Z7P9<<<<',
      '0408307<3305175TTO05KF<<<<<<<8',
      'WILLENQUI<<TEMUL<JOVAYA<LULEN<',
    ]);
    expect(r.valid).toBe(true);
    expect(r.fields.optionalData2).toBe('O5KF');
    expect(r.corrections[0]).toMatchObject({ field: 'optionalData2', reason: 'composite' });
    expect(r.warnings.map((w) => w.code)).toContain('correction_composite_only');
  });

  it('TD2 optional data (5 → S)', () => {
    const r = parse([
      'I<VGBMARNORULWIL<<RANYAKA<OSKESPRAVE',
      'WYAJLLD8D1VGB5509058M3410303ZOC5N6Q4',
    ]);
    expect(r.valid).toBe(true);
    expect(r.fields.optionalData1).toBe('ZOCSN6Q');
  });
});

describe('uncorrectable errors', () => {
  it('a digit misread as another digit in a date is reported, not guessed', () => {
    const r = parse([SPECIMENS.td3[0], 'L898902C36UTO7408132F1204159ZE184226B<<<<<10']);
    expect(r.valid).toBe(false);
    expect(r.corrections).toEqual([]);
    expect(r.checks.find((c) => c.name === 'birthDate')).toMatchObject({
      valid: false,
      computed: 3,
      printed: '2',
    });
  });

  it('a wrong composite digit is reported', () => {
    const r = parse([SPECIMENS.td3[0], 'L898902C36UTO7408122F1204159ZE184226B<<<<<17']);
    expect(r.valid).toBe(false);
    expect(r.checks.find((c) => c.name === 'composite')).toMatchObject({
      valid: false,
      computed: 0,
      printed: '7',
    });
  });
});
