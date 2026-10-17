/** 8-bit grayscale image. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** RGBA image, e.g. a canvas `ImageData`. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createGray(width: number, height: number, fill = 255): GrayImage {
  return { width, height, data: new Uint8Array(width * height).fill(fill) };
}

/** Luminance (BT.601), compositing transparent pixels on white. */
export function toGray(img: RgbaImage): GrayImage {
  const out = createGray(img.width, img.height);
  const d = img.data;
  for (let i = 0, j = 0; j < out.data.length; i += 4, j++) {
    const a = d[i + 3]! / 255;
    const lum = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    out.data[j] = Math.round(lum * a + 255 * (1 - a));
  }
  return out;
}

/** Resize with area averaging when shrinking and bilinear interpolation when enlarging. */
export function resize(img: GrayImage, width: number, height: number): GrayImage {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const out = createGray(width, height);
  const sx = img.width / width;
  const sy = img.height / height;
  if (sx >= 1 && sy >= 1) {
    for (let y = 0; y < height; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < width; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        let sum = 0;
        for (let yy = y0; yy < y1; yy++) {
          const row = yy * img.width;
          for (let xx = x0; xx < x1; xx++) sum += img.data[row + xx]!;
        }
        out.data[y * width + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
      }
    }
    return out;
  }
  for (let y = 0; y < height; y++) {
    const fy = Math.min(img.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    for (let x = 0; x < width; x++) {
      const fx = Math.min(img.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      out.data[y * width + x] = sample(img, fx, fy, 255);
    }
  }
  return out;
}

function sample(img: GrayImage, fx: number, fy: number, bg: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 >= img.width || y0 >= img.height) return bg;
  const x1 = Math.min(x0 + 1, img.width - 1);
  const y1 = Math.min(y0 + 1, img.height - 1);
  const ax = fx - x0;
  const ay = fy - y0;
  const d = img.data;
  const w = img.width;
  const top = d[y0 * w + x0]! * (1 - ax) + d[y0 * w + x1]! * ax;
  const bottom = d[y1 * w + x0]! * (1 - ax) + d[y1 * w + x1]! * ax;
  return Math.round(top * (1 - ay) + bottom * ay);
}

/** Rotate by `degrees` (counter-clockwise for positive values) around the centre, same size. */
export function rotate(img: GrayImage, degrees: number, background = 255): GrayImage {
  if (degrees === 0) return { ...img, data: img.data.slice() };
  const out = createGray(img.width, img.height, background);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (img.width - 1) / 2;
  const cy = (img.height - 1) / 2;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = cos * dx - sin * dy + cx;
      const sy = sin * dx + cos * dy + cy;
      out.data[y * img.width + x] = sample(img, sx, sy, background);
    }
  }
  return out;
}

/** Rotate by 180° (upside-down photos). */
export function rotate180(img: GrayImage): GrayImage {
  return { width: img.width, height: img.height, data: img.data.slice().reverse() };
}

export function crop(img: GrayImage, r: Rect): GrayImage {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const w = Math.max(1, Math.min(img.width - x, Math.round(r.width)));
  const h = Math.max(1, Math.min(img.height - y, Math.round(r.height)));
  const out = createGray(w, h);
  for (let yy = 0; yy < h; yy++) {
    out.data.set(img.data.subarray((y + yy) * img.width + x, (y + yy) * img.width + x + w), yy * w);
  }
  return out;
}

/** Add a white border (helps tesseract with text touching the edge). */
export function pad(img: GrayImage, border: number, value = 255): GrayImage {
  const out = createGray(img.width + 2 * border, img.height + 2 * border, value);
  for (let y = 0; y < img.height; y++) {
    out.data.set(
      img.data.subarray(y * img.width, (y + 1) * img.width),
      (y + border) * out.width + border,
    );
  }
  return out;
}

export function histogram(img: GrayImage): Uint32Array {
  const h = new Uint32Array(256);
  for (const v of img.data) h[v]!++;
  return h;
}

/** Otsu's threshold. */
export function otsuThreshold(img: GrayImage): number {
  const h = histogram(img);
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * h[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += h[t]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * h[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export function binarize(img: GrayImage, threshold = otsuThreshold(img)): GrayImage {
  const out = createGray(img.width, img.height);
  for (let i = 0; i < img.data.length; i++) out.data[i] = img.data[i]! <= threshold ? 0 : 255;
  return out;
}

/** Stretch contrast so the 1st and 99th percentiles map to 0 and 255. */
export function stretchContrast(img: GrayImage): GrayImage {
  const h = histogram(img);
  const n = img.data.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += h[lo]!) < n * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += h[hi]!) < n * 0.01; hi--);
  if (hi <= lo) return { ...img, data: img.data.slice() };
  const out = createGray(img.width, img.height);
  const scale = 255 / (hi - lo);
  for (let i = 0; i < n; i++)
    out.data[i] = Math.max(0, Math.min(255, Math.round((img.data[i]! - lo) * scale)));
  return out;
}

/** Encode as an 8-bit grayscale BMP, a format tesseract (Leptonica) reads in every environment. */
export function encodeBmp(img: GrayImage): Uint8Array {
  const rowSize = (img.width + 3) & ~3;
  const paletteSize = 256 * 4;
  const offset = 14 + 40 + paletteSize;
  const size = offset + rowSize * img.height;
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);
  buf[0] = 0x42; // B
  buf[1] = 0x4d; // M
  view.setUint32(2, size, true);
  view.setUint32(10, offset, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, img.width, true);
  view.setInt32(22, img.height, true); // bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 8, true);
  view.setUint32(34, rowSize * img.height, true);
  view.setUint32(46, 256, true);
  for (let i = 0; i < 256; i++) {
    buf[54 + i * 4] = i;
    buf[55 + i * 4] = i;
    buf[56 + i * 4] = i;
  }
  for (let y = 0; y < img.height; y++) {
    buf.set(
      img.data.subarray(y * img.width, (y + 1) * img.width),
      offset + (img.height - 1 - y) * rowSize,
    );
  }
  return buf;
}
