import { describe, expect, it } from 'vitest';
import { parseMrz } from '../src/index.js';
import { REF, SPECIMENS } from './fixtures.js';

const codes = (r: ReturnType<typeof parseMrz>) => r.errors.map((e) => e.code);

describe('bad input never throws', () => {
  it.each([
    ['empty string', ''],
    ['whitespace', '   \n\t  '],
    ['random text', 'hello world, this is not an MRZ'],
    ['emoji', '🛂🛂🛂'],
    ['one short line', 'P<UTO'],
    ['four lines of junk', 'a\nb\nc\nd'],
    ['very long line', 'X'.repeat(10_000)],
  ])('%s', (_, input) => {
    const r = parseMrz(input);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.beta).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['object', { a: 1 }],
    ['array of numbers', [1, 2]],
  ])('non-string input: %s', (_, input) => {
    const r = parseMrz(input as unknown as string);
    expect(codes(r)).toEqual(['invalid_input']);
  });

  it('reports no_mrz_found for empty input', () => {
    expect(codes(parseMrz(''))).toEqual(['no_mrz_found']);
  });

  it('reports unknown_format for wrong line lengths', () => {
    expect(codes(parseMrz('ABCDEFGHIJ\nABCDEFGHIJ'))).toContain('unknown_format');
  });

  it('reports invalid characters', () => {
    const r = parseMrz([SPECIMENS.td3[0], SPECIMENS.td3[1].replace('ZE18', 'ZE#8')], {
      referenceDate: REF,
    });
    expect(codes(r)).toContain('invalid_characters');
  });

  it('reports an invalid sex code', () => {
    const r = parseMrz([SPECIMENS.td3[0], SPECIMENS.td3[1].replace('2F12', '2Q12')], {
      referenceDate: REF,
    });
    expect(codes(r)).toContain('invalid_sex');
  });

  it('warns about an unknown country code', () => {
    const r = parseMrz(['P<QQQERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', SPECIMENS.td3[1]], {
      referenceDate: REF,
    });
    expect(r.warnings.map((w) => w.code)).toContain('unknown_country_code');
    expect(r.fields.issuingStateName).toBeNull();
  });
});

describe('messy but recoverable input', () => {
  it('lowercase', () => {
    expect(parseMrz(SPECIMENS.td3.join('\n').toLowerCase(), { referenceDate: REF }).valid).toBe(
      true,
    );
  });

  it('spaces inside lines and CRLF line endings', () => {
    const text = SPECIMENS.td3.map((l) => l.replace(/(.{4})/g, '$1 ')).join('\r\n');
    expect(parseMrz(text, { referenceDate: REF }).valid).toBe(true);
  });

  it('« instead of <<', () => {
    const r = parseMrz([SPECIMENS.td3[0].replace('ERIKSSON<<', 'ERIKSSON«'), SPECIMENS.td3[1]], {
      referenceDate: REF,
    });
    expect(r.valid).toBe(true);
  });

  it('blank lines and surrounding text', () => {
    const text = `PASSPORT\nUtopia\n\n${SPECIMENS.td3[0]}\n\n${SPECIMENS.td3[1]}\n`;
    const r = parseMrz(text, { referenceDate: REF });
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('extra_text_ignored');
  });

  it('a line missing a trailing filler is padded', () => {
    const r = parseMrz([SPECIMENS.td3[0].slice(0, 42), SPECIMENS.td3[1]], { referenceDate: REF });
    expect(r.valid).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('line_length_adjusted');
  });

  it('a line with extra trailing fillers is trimmed', () => {
    const r = parseMrz([SPECIMENS.td1[0] + '<<', SPECIMENS.td1[1], SPECIMENS.td1[2] + '<'], {
      referenceDate: REF,
    });
    expect(r.valid).toBe(true);
    expect(r.format).toBe('TD1');
  });

  it('a too-long line without trailing fillers is an error', () => {
    const r = parseMrz([SPECIMENS.td3[0], SPECIMENS.td3[1] + 'AB'], { referenceDate: REF });
    expect(codes(r)).toContain('line_length');
  });

  it('Germany is written D<< and reported as Germany', () => {
    const r = parseMrz(['P<D<<ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', SPECIMENS.td3[1]], {
      referenceDate: REF,
    });
    expect(r.fields.issuingState).toBe('D');
    expect(r.fields.issuingStateName).toBe('Germany');
  });

  it.each(['GBD', 'GBN', 'GBO', 'GBP', 'GBS', 'UNO', 'XXA'])(
    'special code %s has a name',
    (code) => {
      const r = parseMrz([`P<${code}ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<`, SPECIMENS.td3[1]], {
        referenceDate: REF,
      });
      expect(r.fields.issuingStateName).toBeTruthy();
      expect(r.warnings.map((w) => w.code)).not.toContain('unknown_country_code');
    },
  );

  it('sex X is accepted with a warning; < is unspecified', () => {
    const x = parseMrz([SPECIMENS.td3[0], SPECIMENS.td3[1].replace('2F12', '2X12')], {
      referenceDate: REF,
    });
    expect(x.fields.sex).toBe('X');
    expect(x.warnings.map((w) => w.code)).toContain('sex_x');
    const u = parseMrz([SPECIMENS.td3[0], SPECIMENS.td3[1].replace('2F12', '2<12')], {
      referenceDate: REF,
    });
    expect(u.fields.sex).toBeNull();
    expect(u.valid).toBe(true);
  });

  it('warns about an unusual document code', () => {
    const r = parseMrz(['X<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', SPECIMENS.td3[1]], {
      referenceDate: REF,
    });
    expect(r.warnings.map((w) => w.code)).toContain('unexpected_document_code');
  });
});
