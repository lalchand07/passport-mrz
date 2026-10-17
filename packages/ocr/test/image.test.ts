import { describe, expect, it } from 'vitest';
import {
  binarize,
  createGray,
  crop,
  encodeBmp,
  otsuThreshold,
  pad,
  resize,
  rotate,
  rotate180,
  stretchContrast,
  toGray,
} from '../src/image.js';
import { fillRect } from './helpers.js';

describe('image operations', () => {
  it('toGray uses luminance and composites alpha on white', () => {
    const rgba = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0]),
    };
    expect([...toGray(rgba).data]).toEqual([76, 0, 255]);
  });

  it('resize shrinks by averaging and enlarges by interpolation', () => {
    const img = createGray(4, 4, 0);
    fillRect(img, 0, 0, 2, 4, 200);
    const small = resize(img, 2, 2);
    expect([...small.data]).toEqual([200, 0, 200, 0]);
    const big = resize(small, 4, 4);
    expect(big.width).toBe(4);
    expect(big.data[0]).toBe(200);
    expect(big.data[3]).toBe(0);
  });

  it('crop, pad and rotate180', () => {
    const img = createGray(4, 3, 255);
    img.data[5] = 7; // (1,1)
    const c = crop(img, { x: 1, y: 1, width: 2, height: 2 });
    expect([...c.data]).toEqual([7, 255, 255, 255]);
    const p = pad(c, 1);
    expect(p.width).toBe(4);
    expect(p.data[1 * 4 + 1]).toBe(7);
    expect(rotate180(c).data[3]).toBe(7);
    expect(crop(img, { x: -5, y: -5, width: 100, height: 100 }).width).toBe(4);
  });

  it('rotate keeps size and fills with background', () => {
    const img = createGray(20, 10, 0);
    const r = rotate(img, 30, 255);
    expect(r.width).toBe(20);
    expect(r.data[0]).toBe(255);
    expect(r.data[5 * 20 + 10]).toBe(0);
    expect(rotate(img, 0)).toEqual(img);
  });

  it('otsu separates two populations; binarize and stretch', () => {
    const img = createGray(10, 10, 200);
    fillRect(img, 0, 0, 5, 10, 40);
    const t = otsuThreshold(img);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(200);
    const b = binarize(img);
    expect(new Set(b.data)).toEqual(new Set([0, 255]));
    const s = stretchContrast(img);
    expect(Math.min(...s.data)).toBe(0);
    expect(Math.max(...s.data)).toBe(255);
  });

  it('encodeBmp writes a valid 8-bit bottom-up BMP', () => {
    const img = createGray(3, 2, 255);
    img.data[0] = 0;
    const bmp = encodeBmp(img);
    const v = new DataView(bmp.buffer);
    expect(String.fromCharCode(bmp[0]!, bmp[1]!)).toBe('BM');
    expect(v.getUint32(2, true)).toBe(bmp.length);
    expect(v.getInt32(18, true)).toBe(3);
    expect(v.getInt32(22, true)).toBe(2);
    expect(v.getUint16(28, true)).toBe(8);
    const offset = v.getUint32(10, true);
    // Row stride is padded to 4 bytes; top-left pixel is in the last stored row.
    expect(bmp.length).toBe(offset + 4 * 2);
    expect(bmp[offset + 4]).toBe(0);
  });
});
