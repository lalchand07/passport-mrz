import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/cli/run.js';
import { REF, SPECIMENS } from './fixtures.js';
import { generateMrz } from '../src/generate/index.js';

function io(overrides: Partial<CliIo> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const value: CliIo = {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    readStdin: async () => null,
    importOcr: async () => {
      throw new Error('not installed');
    },
    version: '0.0.0-test',
    ...overrides,
  };
  return { io: value, out, err, json: () => JSON.parse(out.join('')) };
}

const valid = generateMrz({
  format: 'TD3',
  seed: 21,
  overrides: { expiryDate: '2031-01-01', birthDate: '1985-05-05' },
});

describe('cli', () => {
  it('prints JSON for a valid MRZ with travel checks', async () => {
    const t = io();
    const code = await runCli(
      [...valid.lines, '--travel-date', '2026-12-15', '--reference-date', REF],
      t.io,
    );
    expect(code).toBe(0);
    const j = t.json();
    expect(j.valid).toBe(true);
    expect(j.travel.ok).toBe(true);
    expect(j.passenger.passengerType).toBe('ADT');
    expect(j.mrz.format).toBe('TD3');
  });

  it('accepts a single concatenated argument', async () => {
    const t = io();
    expect(await runCli([valid.lines.join(''), '--compact'], t.io)).toBe(0);
    expect(t.out.join('').trim().split('\n')).toHaveLength(1);
  });

  it('reads stdin when no MRZ argument is given', async () => {
    const t = io({ readStdin: async () => valid.text + '\n' });
    expect(await runCli([], t.io)).toBe(0);
  });

  it('exits 1 for an invalid MRZ or failed travel check', async () => {
    const t = io();
    expect(await runCli([...SPECIMENS.td3, '--travel-date', '2026-12-15'], t.io)).toBe(1);
    expect(t.json().travel.rule).toBe('expired_before_travel');
    expect(await runCli(['garbage'], io().io)).toBe(1);
  });

  it('usage errors exit 2', async () => {
    expect(await runCli([], io().io)).toBe(2);
    expect(await runCli(['--travel-date', '15/12/2026', 'x'], io().io)).toBe(2);
    expect(await runCli(['--min-months', '-1', 'x'], io().io)).toBe(2);
    expect(await runCli(['--bogus'], io().io)).toBe(2);
    expect(await runCli(['--adult-female-title', 'MISS', 'x'], io().io)).toBe(2);
  });

  it('help and version', async () => {
    const h = io();
    expect(await runCli(['--help'], h.io)).toBe(0);
    expect(h.out.join('')).toContain('Usage: passport-mrz');
    const v = io();
    expect(await runCli(['-v'], v.io)).toBe(0);
    expect(v.out.join('')).toBe('0.0.0-test\n');
  });

  it('--image without the OCR package exits 3 with install instructions', async () => {
    const t = io();
    expect(await runCli(['--image', 'photo.jpg'], t.io)).toBe(3);
    expect(t.err.join('')).toContain('npm install passport-mrz-ocr');
  });

  it('--image uses the OCR module when installed', async () => {
    const { parseMrz } = await import('../src/index.js');
    const t = io({
      importOcr: async () => ({
        readMrzFromFile: async () => ({ mrz: parseMrz(valid.lines), ocr: { confidence: 90 } }),
      }),
    });
    expect(await runCli(['--image', 'photo.jpg'], t.io)).toBe(0);
    expect(t.json().ocr).toEqual({ confidence: 90 });
  });

  it('--adult-female-title MRS', async () => {
    const g = generateMrz({
      format: 'TD3',
      seed: 2,
      overrides: { sex: 'F', birthDate: '1980-01-01', expiryDate: '2030-01-01' },
    });
    const t = io();
    await runCli([...g.lines, '--adult-female-title', 'mrs'], t.io);
    expect(t.json().passenger.title).toBe('MRS');
  });
});
