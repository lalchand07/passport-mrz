import type { RgbaImage } from './image.js';
import { readMrz, type OcrEngine, type ReadOptions, type ReadResult } from './pipeline.js';
import { createTesseractEngine, type TesseractEngineOptions } from './tesseract.js';

export * from './common.js';

/**
 * Create an engine from assets served by your own site. Copy them with
 * `npx passport-mrz-ocr-assets <public dir>/ocr` and pass the URL of that directory.
 */
export function createBrowserEngine(
  assetsUrl: string,
  options: TesseractEngineOptions = {},
): Promise<OcrEngine> {
  const base = new URL(assetsUrl.replace(/\/?$/, '/'), globalThis.location?.href).href;
  return createTesseractEngine(
    { workerPath: `${base}worker.min.js`, corePath: `${base}core`, langPath: `${base}lang` },
    options,
  );
}

export type ImageSource = Blob | HTMLImageElement | HTMLCanvasElement | ImageBitmap | ImageData;

/** Draw an image (photo file, <img>, canvas…) into RGBA pixels, downscaled to `maxSide`. */
export async function imageToRgba(source: ImageSource, maxSide = 2400): Promise<RgbaImage> {
  if (typeof ImageData !== 'undefined' && source instanceof ImageData) return source;
  // createImageBitmap applies EXIF orientation for photos.
  const bitmap =
    source instanceof Blob
      ? await createImageBitmap(source, { imageOrientation: 'from-image' })
      : source;
  const w = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export interface BrowserReadOptions extends ReadOptions {
  engine: OcrEngine;
}

/** Read the MRZ from a photo in the browser. Nothing leaves the device. */
export async function readMrzFromImage(
  source: ImageSource,
  options: BrowserReadOptions,
): Promise<ReadResult> {
  return readMrz(await imageToRgba(source), options.engine, options);
}
