import { correctLines, checkPasses, resolveCheck } from './correct.js';
import type { Layout } from './formats.js';
import type { Issue } from './types.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
const MAX_CANDIDATES = 4000;

export interface LengthRepair {
  lines: string[];
  warnings: Issue[];
  /** Indexes of repaired lines. */
  repaired: number[];
}

function classScore(lines: readonly string[], layout: Layout): number {
  let score = 0;
  for (const d of layout.fields) {
    const v = (lines[d.line] ?? '').slice(d.start, d.start + d.length);
    const allFiller = /^<+$/.test(v);
    for (const c of v) {
      if (
        d.cls === 'digit'
          ? /[0-9]/.test(c) || allFiller
          : d.cls === 'alpha'
            ? /[A-Z<]/.test(c)
            : true
      )
        score++;
    }
    // Plausible calendar dates are evidence too.
    if ((d.name === 'birthDate' || d.name === 'expiryDate') && /^\d{6}$/.test(v)) {
      const month = Number(v.slice(2, 4));
      const day = Number(v.slice(4, 6));
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) score += 10;
    }
  }
  return score;
}

/** Checks passed (dominant), then fewest corrections needed, then class consistency. */
function evaluate(lines: string[], layout: Layout, maxK: number): number {
  const out = correctLines(lines, layout, maxK);
  const grid = out.lines.map((l) => [...l]);
  let passing = 0;
  for (const check of layout.checks) {
    const rc = resolveCheck(layout, check, out.lines);
    if (rc && checkPasses(grid, rc)) passing++;
  }
  const changes = out.corrections.reduce((n, c) => n + c.changes.length, 0);
  return passing * 100_000 - changes * 1000 + classScore(lines, layout);
}

/**
 * Repair lines that OCR made 1–2 characters too long (an inserted character) or one
 * character too short (a dropped character), by trying every deletion / insertion and
 * keeping the unique candidate that passes the most check digits. Falls back to the plain
 * fix (trim trailing fillers or pad) when no candidate is clearly better.
 */
export function repairLineLengths(
  rawLines: readonly string[],
  fallback: readonly string[],
  layout: Layout,
  maxK = 2,
): LengthRepair {
  const lines = [...fallback];
  const warnings: Issue[] = [];
  const repaired: number[] = [];
  rawLines.forEach((raw, i) => {
    const diff = raw.length - layout.lineLength;
    if (diff === 0 || diff > 2 || diff < -1) return;
    // Candidate → tie-break bonus. OCR insertions are usually narrow glyphs produced by
    // splitting a wide letter (N → IN, M → IM), so deleting I, 1 or L is preferred.
    const candidates = new Map<string, number>();
    const add = (c: string, bonus: number) =>
      candidates.set(c, Math.max(bonus, candidates.get(c) ?? 0));
    const narrow = (c: string | undefined) => (c && 'I1L'.includes(c) ? 1 : 0);
    if (diff > 0) {
      for (let a = 0; a < raw.length; a++) {
        const once = raw.slice(0, a) + raw.slice(a + 1);
        if (diff === 1) add(once, narrow(raw[a]));
        else
          for (let b = a; b < once.length; b++)
            add(once.slice(0, b) + once.slice(b + 1), narrow(raw[a]) + narrow(once[b]));
        if (candidates.size > MAX_CANDIDATES) break;
      }
    } else {
      for (let a = 0; a <= raw.length; a++) {
        for (const c of ALPHABET) add(raw.slice(0, a) + c + raw.slice(a), 0);
      }
    }
    const score = (candidate: string) => {
      const trial = [...lines];
      trial[i] = candidate;
      return evaluate(trial, layout, maxK);
    };
    const baseline = score(lines[i]!);
    let best = baseline;
    let winners: string[] = [];
    for (const [c, bonus] of candidates) {
      const s = score(c) + bonus;
      if (s > best) {
        best = s;
        winners = [c];
      } else if (s === best && s > baseline) winners.push(c);
    }
    // Only checks count as evidence; class consistency alone may break ties.
    if (winners.length === 1 && Math.round(best / 100_000) > Math.round(baseline / 100_000)) {
      lines[i] = winners[0]!;
      repaired.push(i);
      warnings.push({
        code: 'line_length_repaired',
        message: `Line ${i + 1} had ${raw.length} characters; ${
          diff > 0 ? `removed ${diff} extra` : 'restored 1 missing'
        } character(s) where the check digits indicated (now "${winners[0]}").`,
      });
    }
  });
  return { lines, warnings, repaired };
}
