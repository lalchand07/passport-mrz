import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import type { RgbaImage } from './image.js';
import { readMrz, type OcrEngine, type ReadOptions, type ReadResult } from './pipeline.js';
import { createTesseractEngine, type TesseractEngineOptions } from './tesseract.js';

export * from './common.js';

const require = createRequire(import.meta.url);

/** Directory of the bundled `eng.traineddata.gz` (tessdata 4.0.0: legacy + LSTM). */
export function bundledLangPath(): string {
  return join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0');
}

/** Tesseract engine using only files installed in node_modules. */
export function createNodeEngine(options: TesseractEngineOptions = {}): Promise<OcrEngine> {
  return createTesseractEngine({ langPath: bundledLangPath() }, options);
}

/** Decode a JPEG or PNG file into RGBA pixels. */
export function decodeImage(bytes: Uint8Array): RgbaImage {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const img = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 1024,
    });
    return { width: img.width, height: img.height, data: img.data };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const img = PNG.sync.read(Buffer.from(bytes));
    return { width: img.width, height: img.height, data: img.data };
  }
  throw new Error('Unsupported image format: only JPEG and PNG are supported.');
}

export interface NodeReadOptions extends ReadOptions {
  /** Reuse an engine across calls (faster for batches). Not terminated by this call. */
  engine?: OcrEngine;
}

/** Read the MRZ from a JPEG or PNG on disk. Runs fully offline. */
export async function readMrzFromFile(
  path: string,
  options: NodeReadOptions = {},
): Promise<ReadResult> {
  return readMrzFromBuffer(await readFile(path), options);
}

export async function readMrzFromBuffer(
  bytes: Uint8Array,
  options: NodeReadOptions = {},
): Promise<ReadResult> {
  const image = decodeImage(bytes);
  const engine = options.engine ?? (await createNodeEngine());
  try {
    return await readMrz(image, engine, options);
  } finally {
    if (!options.engine) await engine.terminate();
  }
}
