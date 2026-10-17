import { describe, expect, it } from 'vitest';
import { createGray } from '../src/image.js';
import { edgeMap, estimateSkew, locateMrz } from '../src/locate.js';
import { syntheticDocument } from './helpers.js';

describe('MRZ location', () => {
  it.each([2, 3])('finds %i MRZ lines at the bottom of a straight page', (n) => {
    const doc = syntheticDocument({ mrzLines: n });
    const loc = locateMrz(doc.image);
    expect(loc.found).toBe(true);
    expect(loc.lineCount).toBe(n);
    expect(loc.angle).toBe(0);
    expect(loc.region.y).toBeLessThanOrEqual(doc.mrzTop);
    expect(loc.region.y + loc.region.height).toBeGreaterThanOrEqual(doc.mrzBottom - 10);
    expect(loc.region.y).toBeGreaterThan(doc.image.height * 0.5);
  });

  it.each([-3, -1.5, 2, 4])('estimates a skew of %f degrees', (angle) => {
    const doc = syntheticDocument({ angle });
    const loc = locateMrz(doc.image);
    expect(loc.found).toBe(true);
    expect(Math.abs(loc.angle - angle)).toBeLessThanOrEqual(0.6);
  });

  it('works on large images (downscaled for analysis)', () => {
    const doc = syntheticDocument({ width: 2400 });
    const loc = locateMrz(doc.image);
    expect(loc.found).toBe(true);
    expect(loc.region.width).toBeGreaterThan(1500);
  });

  it('falls back to the bottom of a blank image', () => {
    const loc = locateMrz(createGray(600, 400, 240));
    expect(loc.found).toBe(false);
    expect(loc.region.y).toBeCloseTo(400 * 0.65);
  });

  it('skew of an empty edge map is 0', () => {
    expect(estimateSkew(edgeMap(createGray(100, 100, 255)))).toBe(0);
  });
});
