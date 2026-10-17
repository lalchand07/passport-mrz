import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeBmp } from '../src/image.js';
import { createNodeEngine, readMrzFromBuffer } from '../src/node.js';
import { syntheticDocument } from './helpers.js';
import { PNG } from 'pngjs';

describe('tesseract engine (real, offline)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts from local files and recognizes without any network access', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network disabled in test'));
    const engine = await createNodeEngine();
    try {
      expect(engine.passes).toEqual(['legacy', 'lstm']);
      const run = await engine.recognize(encodeBmp(syntheticDocument().image), 'legacy');
      expect(typeof run.text).toBe('string');
      expect(run.confidence).toBeGreaterThanOrEqual(0);
    } finally {
      await engine.terminate();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 60_000);

  it('readMrzFromBuffer returns a structured result for a PNG without an MRZ', async () => {
    const { image } = syntheticDocument();
    const png = new PNG({ width: image.width, height: image.height });
    for (let i = 0; i < image.data.length; i++)
      png.data.set([image.data[i]!, image.data[i]!, image.data[i]!, 255], i * 4);
    const engine = await createNodeEngine({ passes: ['legacy'] });
    try {
      const r = await readMrzFromBuffer(PNG.sync.write(png), {
        engine,
        rotations: [0],
        confirm: false,
      });
      expect(r.mrz.valid).toBe(false);
      expect(r.ocr.reviewRecommended).toBe(true);
    } finally {
      await engine.terminate();
    }
  }, 60_000);
});
