import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { OcrEngine, OcrLine } from './pipeline.js';

export const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/** Recognition passes, tried in order until the MRZ validates. */
export type TesseractPass = 'legacy' | 'lstm';

export interface TesseractPaths {
  /** Directory or URL holding `eng.traineddata.gz` (the `4.0.0` model with legacy + LSTM data). */
  langPath: string;
  /** Directory or URL of the tesseract.js-core files (browser), or undefined in Node. */
  corePath?: string;
  /** URL of tesseract.js `worker.min.js` (browser), or undefined in Node. */
  workerPath?: string;
  /**
   * Start the worker from a blob: URL. In browsers this makes the worker inherit the page's
   * Content-Security-Policy, so a policy that blocks network requests applies to OCR too.
   */
  workerBlobURL?: boolean;
}

export interface TesseractEngineOptions {
  /**
   * Passes to run. The legacy engine honours the character whitelist strictly and reads
   * monospaced MRZ text best in our benchmark; LSTM is a fallback. Default ['legacy', 'lstm'].
   */
  passes?: TesseractPass[];
  logger?: (m: { status: string; progress: number }) => void;
}

/**
 * Create a tesseract.js engine configured for MRZ text. Every path is set explicitly:
 * tesseract.js falls back to a CDN only when a path is missing.
 */
export async function createTesseractEngine(
  paths: TesseractPaths,
  options: TesseractEngineOptions = {},
): Promise<OcrEngine> {
  const passes = options.passes ?? ['legacy', 'lstm'];
  const workers = new Map<TesseractPass, Worker>();
  for (const pass of passes) {
    const legacy = pass === 'legacy';
    const worker = await createWorker(
      'eng',
      legacy ? OEM.TESSERACT_ONLY : OEM.LSTM_ONLY,
      {
        langPath: paths.langPath,
        ...(paths.corePath ? { corePath: paths.corePath } : {}),
        ...(paths.workerPath ? { workerPath: paths.workerPath } : {}),
        gzip: true,
        cacheMethod: 'none',
        workerBlobURL: paths.workerBlobURL ?? false,
        legacyCore: legacy,
        legacyLang: true,
        ...(options.logger ? { logger: options.logger } : {}),
      },
      { load_system_dawg: '0', load_freq_dawg: '0' },
    );
    await worker.setParameters({
      tessedit_char_whitelist: MRZ_WHITELIST,
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      user_defined_dpi: '300',
    });
    workers.set(pass, worker);
  }
  return {
    passes,
    async recognize(image, pass) {
      const worker = workers.get((pass as TesseractPass) ?? passes[0]!) ?? workers.get(passes[0]!)!;
      const { data } = await worker.recognize(
        image as unknown as Buffer,
        {},
        { text: true, blocks: true },
      );
      const lines: OcrLine[] = (data.blocks ?? [])
        .flatMap((b) => b.paragraphs)
        .flatMap((p) => p.lines)
        .map((l) => ({ text: l.text.trim(), confidence: Math.round(l.confidence) }));
      return { text: data.text, confidence: Math.round(data.confidence), lines };
    },
    async terminate() {
      await Promise.all([...workers.values()].map((w) => w.terminate()));
    },
  };
}
