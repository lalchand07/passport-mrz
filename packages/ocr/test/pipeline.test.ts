import { describe, expect, it } from 'vitest';
import { generateMrz } from 'passport-mrz/generate';
import { prepareMrzImage, readMrz, type OcrEngine } from '../src/pipeline.js';
import { syntheticDocument } from './helpers.js';

const truth = generateMrz({ format: 'TD3', seed: 77, overrides: { expiryDate: '2031-01-01' } });

/** Engine stub returning scripted OCR outputs in order (last one repeats). */
function stub(outputs: string[], passes?: string[]): OcrEngine & { calls: { pass?: string }[] } {
  const calls: { pass?: string }[] = [];
  return {
    calls,
    passes,
    async recognize(_img, pass) {
      calls.push({ pass });
      const text = outputs[Math.min(calls.length - 1, outputs.length - 1)]!;
      return {
        text,
        confidence: 88,
        lines: text.split('\n').map((t) => ({ text: t, confidence: 90 })),
      };
    },
    async terminate() {},
  };
}

const image = syntheticDocument().image;

describe('prepareMrzImage', () => {
  it('produces binary and gray crops scaled for OCR', () => {
    const p = prepareMrzImage(image);
    expect(p.location.found).toBe(true);
    expect(p.variants.map((v) => v.name)).toEqual(['binary', 'gray']);
    const bin = p.variants[0]!.image;
    expect(new Set(bin.data).size).toBeLessThanOrEqual(2);
    expect(bin.width).toBeGreaterThan(bin.height * 3);
  });

  it('accepts RGBA input', () => {
    const rgba = {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.width * image.height * 4),
    };
    for (let i = 0; i < image.data.length; i++) {
      rgba.data.set([image.data[i]!, image.data[i]!, image.data[i]!, 255], i * 4);
    }
    expect(prepareMrzImage(rgba).location.found).toBe(true);
  });
});

describe('readMrz', () => {
  it('parses OCR text, confirms with a second attempt and reports confidence', async () => {
    const engine = stub([truth.text]);
    const r = await readMrz(image, engine, { parse: { referenceDate: '2026-10-17' } });
    expect(r.mrz.valid).toBe(true);
    expect(r.ocr.confirmed).toBe(true);
    expect(r.ocr.attempts).toBe(2);
    expect(r.ocr.confidence).toBe(88);
    expect(r.ocr.lines.map((l) => l.confidence)).toEqual([90, 90]);
    expect(r.ocr.correctedLines).toEqual([]);
    expect(r.ocr.reviewRecommended).toBe(false);
  });

  it('reports corrected lines and recommends review', async () => {
    const misread = truth.lines[0] + '\n' + truth.lines[1]!.replace(/0/, 'O');
    const r = await readMrz(image, stub([misread]), {
      parse: { referenceDate: '2026-10-17' },
      confirm: false,
    });
    expect(r.mrz.valid).toBe(true);
    expect(r.ocr.correctedLines).toEqual([1]);
    expect(r.ocr.lines[1]!.corrected).toBe(true);
    expect(r.ocr.reviewRecommended).toBe(true);
    expect(r.ocr.reviewReasons.join(' ')).toContain('corrected');
  });

  it('flags a disagreeing second read', async () => {
    const other = generateMrz({ format: 'TD3', seed: 78 }).text;
    const r = await readMrz(image, stub([truth.text, other]), {
      parse: { referenceDate: '2026-10-17' },
    });
    expect(r.ocr.confirmed).toBe(false);
    expect(r.ocr.alternative).toEqual(generateMrz({ format: 'TD3', seed: 78 }).lines);
    expect(r.ocr.reviewRecommended).toBe(true);
  });

  it('tries engine passes and variants in order until valid', async () => {
    const engine = stub(['garbage', 'still garbage', truth.text], ['legacy', 'lstm']);
    const r = await readMrz(image, engine, { confirm: false, rotations: [0] });
    expect(r.mrz.valid).toBe(true);
    expect(engine.calls.map((c) => c.pass)).toEqual(['legacy', 'legacy', 'lstm']);
    expect(r.ocr).toMatchObject({ pass: 'lstm', variant: 'binary', rotation: 0 });
  });

  it('tries the upside-down rotation when nothing is found', async () => {
    const engine = stub(['x', 'x', truth.text]);
    const r = await readMrz(image, engine, { confirm: false });
    expect(r.ocr.rotation).toBe(180);
    expect(r.mrz.valid).toBe(true);
  });

  it('returns the best invalid result when nothing validates', async () => {
    const r = await readMrz(image, stub(['nothing here']), { confirm: false });
    expect(r.mrz.valid).toBe(false);
    expect(r.ocr.attempts).toBe(8); // 4 rotations × 2 variants
    expect(r.ocr.reviewRecommended).toBe(true);
  });
});
