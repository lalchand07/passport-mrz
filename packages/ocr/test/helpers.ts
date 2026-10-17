import { createGray, rotate, type GrayImage } from '../src/image.js';

/** Fill a rectangle with a gray value. */
export function fillRect(img: GrayImage, x: number, y: number, w: number, h: number, v = 20): void {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++)
      img.data[yy * img.width + xx] = v;
}

/**
 * A synthetic "document": a light page with a photo block, a few short label lines, and
 * `mrzLines` rows of evenly spaced glyph-like blocks at the bottom (no font needed).
 */
export function syntheticDocument(
  opts: { mrzLines?: number; angle?: number; width?: number } = {},
): {
  image: GrayImage;
  mrzTop: number;
  mrzBottom: number;
} {
  const width = opts.width ?? 1000;
  const height = Math.round(width * 0.68);
  const img = createGray(width, height, 235);
  fillRect(img, 40, 60, 200, 260, 180); // photo
  for (let i = 0; i < 5; i++) fillRect(img, 280, 80 + i * 40, 160 + (i % 3) * 40, 14, 60); // labels
  const lines = opts.mrzLines ?? 2;
  const glyph = Math.round(width / 52);
  const lineHeight = Math.round(glyph * 1.4);
  const mrzBottom = height - 40;
  const mrzTop = mrzBottom - lines * lineHeight * 1.6;
  for (let l = 0; l < lines; l++) {
    const y = Math.round(mrzTop + l * lineHeight * 1.6);
    for (let c = 0; c < 44; c++) {
      const x = 40 + c * glyph;
      // Vertical strokes make glyph-like edges.
      fillRect(img, x + 2, y, 3, lineHeight, 15);
      if (c % 3 !== 0) fillRect(img, x + glyph - 8, y, 3, lineHeight, 15);
      if (c % 2) fillRect(img, x + 2, y + lineHeight / 2, glyph - 8, 3, 15);
    }
  }
  const image = opts.angle ? rotate(img, opts.angle, 235) : img;
  return { image, mrzTop, mrzBottom };
}
