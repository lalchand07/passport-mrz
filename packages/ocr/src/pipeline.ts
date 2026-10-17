import { parseMrz, type MrzResult, type ParseOptions } from 'passport-mrz';
import {
  binarize,
  crop,
  encodeBmp,
  pad,
  resize,
  rotate,
  rotate180,
  stretchContrast,
  toGray,
  type GrayImage,
  type Rect,
  type RgbaImage,
} from './image.js';
import { locateMrz, type MrzLocation } from './locate.js';

/** Largest working width; bigger photos are downscaled first. */
const WORKING_WIDTH = 2000;
/** OCR confidence below which a review is recommended. */
const LOW_CONFIDENCE = 70;
/** Text line height (px) the crop is scaled to before OCR. */
const TARGET_LINE_HEIGHT = 36;

export interface PreparedMrz {
  location: MrzLocation;
  /** Preprocessed crops to OCR, best first. */
  variants: { name: 'binary' | 'gray'; image: GrayImage }[];
}

const isGray = (img: RgbaImage | GrayImage): img is GrayImage =>
  img.data.length === img.width * img.height;

/** Detect the MRZ region, deskew, crop, scale and threshold it. */
export function prepareMrzImage(input: RgbaImage | GrayImage): PreparedMrz {
  let gray = isGray(input) ? input : toGray(input);
  if (gray.width > WORKING_WIDTH) {
    gray = resize(gray, WORKING_WIDTH, (gray.height * WORKING_WIDTH) / gray.width);
  }
  const location = locateMrz(gray);
  const straight = location.angle ? rotate(gray, -location.angle) : gray;
  const region = crop(straight, location.region);
  const scale = location.found
    ? Math.min(4, Math.max(0.4, TARGET_LINE_HEIGHT / location.lineHeight))
    : Math.min(2, Math.max(0.5, 1600 / region.width));
  const scaled = stretchContrast(resize(region, region.width * scale, region.height * scale));
  const border = Math.round(TARGET_LINE_HEIGHT * 0.6);
  return {
    location,
    variants: [
      { name: 'binary', image: pad(binarize(scaled), border) },
      { name: 'gray', image: pad(scaled, border) },
    ],
  };
}

export interface OcrLine {
  text: string;
  confidence: number;
}

export interface OcrRun {
  text: string;
  /** Mean confidence 0–100 reported by tesseract. */
  confidence: number;
  lines: OcrLine[];
}

/** Anything that turns an encoded image into text — tesseract.js, or a stub in tests. */
export interface OcrEngine {
  /** Named recognition passes, tried in order until the MRZ validates. Default: one pass. */
  passes?: readonly string[];
  recognize(image: Uint8Array, pass?: string): Promise<OcrRun>;
  terminate(): Promise<void>;
}

export interface OcrReport {
  /** Raw OCR text of the chosen attempt. */
  text: string;
  /** Mean OCR confidence 0–100. */
  confidence: number;
  /** MRZ lines as read by OCR, with confidence and whether correction changed them. */
  lines: { text: string; confidence: number | null; corrected: boolean }[];
  /** Indexes (0-based) of MRZ lines changed by checksum correction. */
  correctedLines: number[];
  /** Which recognition pass, preprocessing variant and rotation produced the result. */
  pass: string;
  variant: string;
  rotation: 0 | 90 | 180 | 270;
  mrzFound: boolean;
  region: Rect;
  skewAngle: number;
  attempts: number;
  /** A second, independent attempt produced the same MRZ. */
  confirmed: boolean;
  /** MRZ lines from a disagreeing valid read, if any. */
  alternative: string[] | null;
  /**
   * True when a person should compare the result with the photo: the MRZ did not validate,
   * a correction was applied, OCR confidence was low, or the document has few check digits.
   * Names are never protected by a check digit, so always compare them visually.
   */
  reviewRecommended: boolean;
  reviewReasons: string[];
}

export interface ReadResult {
  mrz: MrzResult;
  ocr: OcrReport;
}

export interface ReadOptions {
  parse?: ParseOptions;
  /** Rotations to try, in order, until a valid MRZ is read. Default [0, 180, 90, 270]. */
  rotations?: ReadonlyArray<0 | 90 | 180 | 270>;
  /**
   * After a valid read, run one more attempt (another preprocessing variant or engine pass)
   * and compare. Catches errors check digits cannot see. Default true.
   */
  confirm?: boolean;
}

function rotate90(img: GrayImage, clockwise: boolean): GrayImage {
  const out: GrayImage = {
    width: img.height,
    height: img.width,
    data: new Uint8Array(img.data.length),
  };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const nx = clockwise ? img.height - 1 - y : y;
      const ny = clockwise ? x : img.width - 1 - x;
      out.data[ny * out.width + nx] = img.data[y * img.width + x]!;
    }
  }
  return out;
}

function score(r: MrzResult): number {
  if (r.valid) return 1000;
  return (r.format ? 100 : 0) + r.checks.filter((c) => c.valid).length * 10 - r.errors.length;
}

/** Locate, preprocess and OCR the MRZ, then parse it with checksum correction. */
export async function readMrz(
  input: RgbaImage | GrayImage,
  engine: OcrEngine,
  options: ReadOptions = {},
): Promise<ReadResult> {
  const base = isGray(input) ? input : toGray(input);
  let best: {
    mrz: MrzResult;
    run: OcrRun;
    prepared: PreparedMrz;
    pass: string;
    variant: string;
    rotation: 0 | 90 | 180 | 270;
  } | null = null;
  const passes = engine.passes?.length ? engine.passes : ['default'];
  let confirmed = false;
  let alternative: string[] | null = null;
  let attempts = 0;
  for (const rotation of options.rotations ?? [0, 180, 90, 270]) {
    // Sideways rotations only when the upright ones did not even find an MRZ format.
    if ((rotation === 90 || rotation === 270) && best?.mrz.format) break;
    const img =
      rotation === 0 ? base : rotation === 180 ? rotate180(base) : rotate90(base, rotation === 90);
    const prepared = prepareMrzImage(img);
    const encoded = prepared.variants.map((v) => ({ name: v.name, bytes: encodeBmp(v.image) }));
    const plan = passes.flatMap((pass) => encoded.map((v) => ({ pass, v })));
    for (let k = 0; k < plan.length; k++) {
      const { pass, v } = plan[k]!;
      attempts++;
      const run = await engine.recognize(v.bytes, pass);
      const mrz = parseMrz(run.text, options.parse);
      if (!best || score(mrz) > score(best.mrz))
        best = { mrz, run, prepared, pass, variant: v.name, rotation };
      if (mrz.valid) {
        if (options.confirm !== false) {
          // Look for an independent second valid read among the remaining attempts.
          for (let j = k + 1; j < plan.length; j++) {
            attempts++;
            const other = parseMrz(
              (await engine.recognize(plan[j]!.v.bytes, plan[j]!.pass)).text,
              options.parse,
            );
            if (!other.valid) continue;
            if (other.lines.join('\n') === mrz.lines.join('\n')) confirmed = true;
            else alternative = other.lines;
            break;
          }
        }
        break;
      }
    }
    if (best?.mrz.valid) break;
  }
  const b = best!;
  const correctedLines = [
    ...new Set(b.mrz.corrections.flatMap((c) => c.changes.map((x) => x.line))),
  ].sort();
  const clean = (s: string) => s.toUpperCase().replace(/\s+/g, '');
  const lines = b.mrz.input.map((text, i) => {
    const match = b.run.lines.find(
      (l) => clean(l.text).startsWith(text.replace(/<+$/, '')) || clean(l.text) === text,
    );
    return {
      text,
      confidence: match ? match.confidence : null,
      corrected: correctedLines.includes(i),
    };
  });
  const reviewReasons: string[] = [];
  if (!b.mrz.valid) reviewReasons.push('The MRZ did not validate.');
  if (b.mrz.corrections.length) reviewReasons.push('OCR errors were corrected using check digits.');
  if (b.mrz.warnings.some((w) => w.code === 'line_length_repaired'))
    reviewReasons.push('A missing or extra character was repaired.');
  if (b.run.confidence < LOW_CONFIDENCE)
    reviewReasons.push(`Low OCR confidence (${b.run.confidence}).`);
  if (b.mrz.format === 'MRVA' || b.mrz.format === 'MRVB')
    reviewReasons.push('Visas have no composite check digit, so fewer OCR errors can be detected.');
  if (alternative)
    reviewReasons.push(
      `Another OCR attempt read a different valid MRZ: ${alternative.join(' / ')}`,
    );
  if (b.mrz.warnings.some((w) => w.code === 'unknown_country_code'))
    reviewReasons.push('A country code is not recognized; it may be misread.');
  if (!b.prepared.location.found)
    reviewReasons.push('The MRZ region was not detected; the bottom of the image was used.');
  return {
    mrz: b.mrz,
    ocr: {
      reviewRecommended: reviewReasons.length > 0,
      reviewReasons,
      text: b.run.text,
      confidence: b.run.confidence,
      lines,
      correctedLines,
      pass: b.pass,
      variant: b.variant,
      rotation: b.rotation,
      mrzFound: b.prepared.location.found,
      region: b.prepared.location.region,
      skewAngle: b.prepared.location.angle,
      attempts,
      confirmed,
      alternative,
    },
  };
}
