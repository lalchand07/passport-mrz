import { createGray, resize, rotate, stretchContrast, type GrayImage, type Rect } from './image.js';

export interface MrzLocation {
  /** True when 2–3 MRZ-like text lines were found; otherwise `region` is a fallback. */
  found: boolean;
  /** Region in the coordinates of the deskewed image. */
  region: Rect;
  /** Skew angle in degrees; rotate by `-angle` to deskew. */
  angle: number;
  /** Number of text lines detected in the region. */
  lineCount: number;
  /** Average height of the detected text lines (pixels, input scale). */
  lineHeight: number;
}

const ANALYSIS_WIDTH = 800;
const BINS = 32;

/** Horizontal-gradient edge map: text has many vertical strokes. */
export function edgeMap(img: GrayImage): GrayImage {
  const out = createGray(img.width, img.height, 0);
  const grad = new Uint8Array(img.width * img.height);
  let sum = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 1; x < img.width - 1; x++) {
      const i = y * img.width + x;
      const g = Math.abs(img.data[i + 1]! - img.data[i - 1]!);
      grad[i] = g;
      sum += g;
    }
  }
  const mean = sum / grad.length;
  const threshold = Math.max(40, mean * 3);
  for (let i = 0; i < grad.length; i++) out.data[i] = grad[i]! >= threshold ? 1 : 0;
  return out;
}

/** Estimate skew from the sharpness of the row projection of edge pixels. */
export function estimateSkew(edges: GrayImage, maxDegrees = 5, step = 0.5): number {
  const pts: number[] = [];
  for (let y = 0; y < edges.height; y++)
    for (let x = 0; x < edges.width; x++) if (edges.data[y * edges.width + x]) pts.push(x, y);
  if (pts.length < 200) return 0;
  const cx = edges.width / 2;
  const cy = edges.height / 2;
  const size = edges.height * 2;
  let best = 0;
  let bestScore = -1;
  for (let a = -maxDegrees; a <= maxDegrees + 1e-9; a += step) {
    const rad = (a * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const hist = new Float64Array(size);
    for (let i = 0; i < pts.length; i += 2) {
      // Row of the point after rotating the image by -a.
      const yr = Math.round(sin * (pts[i]! - cx) + cos * (pts[i + 1]! - cy) + edges.height);
      if (yr >= 0 && yr < size) hist[yr]!++;
    }
    let score = 0;
    for (const v of hist) score += v * v;
    if (
      score > bestScore + 1e-6 ||
      (Math.abs(score - bestScore) < 1e-6 && Math.abs(a) < Math.abs(best))
    ) {
      bestScore = score;
      best = a;
    }
  }
  return Math.round(best * 10) / 10;
}

interface Band {
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  coverage: number;
}

/** Find horizontal text bands: rows whose edges span most of the width. */
export function findBands(edges: GrayImage): Band[] {
  const { width, height, data } = edges;
  const binWidth = width / BINS;
  const rowCoverage = new Float64Array(height);
  const rowDensity = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    const bins = new Uint8Array(BINS);
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (data[y * width + x]) {
        count++;
        bins[Math.min(BINS - 1, Math.floor(x / binWidth))] = 1;
      }
    }
    rowDensity[y] = count / width;
    rowCoverage[y] = bins.reduce((s, b) => s + b, 0) / BINS;
  }
  const isText = (y: number) => rowCoverage[y]! >= 0.4 && rowDensity[y]! >= 0.03;
  const bands: Band[] = [];
  let y = 0;
  while (y < height) {
    if (!isText(y)) {
      y++;
      continue;
    }
    const y0 = y;
    let gap = 0;
    while (y < height && gap <= 1) {
      gap = isText(y) ? 0 : gap + 1;
      y++;
    }
    const y1 = y - gap;
    if (y1 - y0 >= 3) {
      let cov = 0;
      const active = new Uint8Array(width);
      for (let yy = y0; yy < y1; yy++) {
        cov += rowCoverage[yy]!;
        for (let x = 0; x < width; x++) if (data[yy * width + x]) active[x] = 1;
      }
      // Horizontal extent: the widest cluster of active columns, ignoring isolated edges
      // such as the page border. Gaps up to ~1.5 line heights join characters and words.
      const maxGap = Math.max(4, (y1 - y0) * 1.5);
      let x0 = 0;
      let x1 = -1;
      let start = -1;
      let last = -1;
      for (let x = 0; x <= width; x++) {
        if (x < width && active[x]) {
          if (start < 0 || x - last > maxGap) {
            if (start >= 0 && last - start > x1 - x0) [x0, x1] = [start, last];
            start = x;
          }
          last = x;
        } else if (x === width && start >= 0 && last - start > x1 - x0) {
          [x0, x1] = [start, last];
        }
      }
      bands.push({ y0, y1, x0, x1, coverage: cov / (y1 - y0) });
    }
  }
  return bands;
}

/** Choose the lowest group of 2–3 similar, evenly spaced, wide bands. */
export function pickMrzBands(bands: Band[], imageHeight: number): Band[] | null {
  let best: { group: Band[]; score: number } | null = null;
  for (let i = 0; i < bands.length; i++) {
    for (const n of [3, 2]) {
      const group = bands.slice(i, i + n);
      if (group.length < n) continue;
      const heights = group.map((b) => b.y1 - b.y0);
      const hMin = Math.min(...heights);
      const hMax = Math.max(...heights);
      if (hMax > hMin * 1.8) continue;
      const gaps = group.slice(1).map((b, k) => b.y0 - group[k]!.y1);
      if (gaps.some((g) => g > hMax * 2.5)) continue;
      if (gaps.length > 1 && Math.max(...gaps) > Math.min(...gaps) * 2.5 + 2) continue;
      const x0s = group.map((b) => b.x0);
      const x1s = group.map((b) => b.x1);
      // MRZ lines start at the same left margin.
      if (Math.max(...x0s) - Math.min(...x0s) > (Math.max(...x1s) - Math.min(...x0s)) * 0.15)
        continue;
      const coverage = group.reduce((s, b) => s + b.coverage, 0) / n;
      const bottom = group[n - 1]!.y1 / imageHeight;
      const score = coverage + bottom * 0.8 + (n === 3 ? 0.05 : 0);
      if (!best || score > best.score) best = { group, score };
    }
  }
  return best?.group ?? null;
}

/**
 * Locate the MRZ in a (grayscale) document photo. Works on a downscaled copy; the returned
 * region is scaled back to the input size, in the coordinates of the image rotated by -angle.
 */
export function locateMrz(img: GrayImage): MrzLocation {
  const scale = Math.min(1, ANALYSIS_WIDTH / img.width);
  const small = stretchContrast(resize(img, img.width * scale, img.height * scale));
  const angle = estimateSkew(edgeMap(small));
  const straight = angle ? rotate(small, -angle) : small;
  const edges = edgeMap(straight);
  const group = pickMrzBands(findBands(edges), straight.height);
  if (!group) {
    // Fallback: the bottom 35% of the page, full width.
    return {
      found: false,
      angle,
      lineCount: 0,
      lineHeight: 0,
      region: { x: 0, y: img.height * 0.65, width: img.width, height: img.height * 0.35 },
    };
  }
  const lineHeight = group.reduce((s, b) => s + b.y1 - b.y0, 0) / group.length;
  const marginY = lineHeight * 0.8;
  const marginX = lineHeight * 2.5;
  const x0 = Math.max(0, Math.min(...group.map((b) => b.x0)) - marginX);
  const x1 = Math.min(straight.width, Math.max(...group.map((b) => b.x1)) + marginX);
  const y0 = Math.max(0, group[0]!.y0 - marginY);
  const y1 = Math.min(straight.height, group[group.length - 1]!.y1 + marginY);
  return {
    found: true,
    angle,
    lineCount: group.length,
    lineHeight: lineHeight / scale,
    region: { x: x0 / scale, y: y0 / scale, width: (x1 - x0) / scale, height: (y1 - y0) / scale },
  };
}
