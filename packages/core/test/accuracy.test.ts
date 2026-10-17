import { describe, expect, it } from 'vitest';
import { parseMrz } from '../src/index.js';
import { generateMrz, mutateOcr } from '../src/generate/index.js';
import { REF } from './fixtures.js';

/**
 * Correction accuracy on synthetic data. The numbers are quoted in the README; if this test
 * changes them, update the README.
 */
function measure(errors: number, docs = 2000) {
  let restored = 0;
  let good = 0;
  let bad = 0;
  for (let i = 0; i < docs; i++) {
    const g = generateMrz({ seed: i });
    const m = mutateOcr(g.lines, { seed: i * 7 + errors, count: errors });
    const r = parseMrz(m.lines, { referenceDate: REF });
    if (r.lines.join() === g.lines.join()) restored++;
    for (const c of r.corrections)
      for (const ch of c.changes) {
        if (g.lines[ch.line]![ch.position] === ch.to) good++;
        else bad++;
      }
  }
  return { restored: restored / docs, wrongChangeRate: bad / Math.max(1, good + bad) };
}

describe('correction accuracy (synthetic)', () => {
  it('one OCR confusion: ≥ 88% fully restored, no wrong changes', () => {
    const m = measure(1);
    expect(m.restored).toBeGreaterThanOrEqual(0.88);
    expect(m.wrongChangeRate).toBe(0);
  });

  it('two OCR confusions: ≥ 78% fully restored, < 0.5% wrong changes', () => {
    const m = measure(2);
    expect(m.restored).toBeGreaterThanOrEqual(0.78);
    expect(m.wrongChangeRate).toBeLessThan(0.005);
  });
});
