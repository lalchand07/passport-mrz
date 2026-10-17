import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { bundledLangPath, decodeImage } from '../src/node.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('node helpers', () => {
  it('decodes PNG', () => {
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([10, 20, 30, 255, 40, 50, 60, 255]);
    const img = decodeImage(PNG.sync.write(png));
    expect(img.width).toBe(2);
    expect([...img.data.slice(0, 4)]).toEqual([10, 20, 30, 255]);
  });

  it('decodes JPEG', () => {
    const data = Buffer.alloc(8 * 8 * 4, 128);
    const enc = jpeg.encode({ data, width: 8, height: 8 }, 90);
    const img = decodeImage(enc.data);
    expect(img.width).toBe(8);
    expect(Math.abs(img.data[0]! - 128)).toBeLessThan(5);
  });

  it('rejects other formats', () => {
    expect(() => decodeImage(new Uint8Array([1, 2, 3]))).toThrow('Unsupported');
  });

  it('the English model is installed locally (no download at runtime)', () => {
    expect(existsSync(join(bundledLangPath(), 'eng.traineddata.gz'))).toBe(true);
  });
});
