import { LAYOUTS, type Layout } from './formats.js';
import type { Issue, MrzFormat } from './types.js';

const LOOKALIKES: Record<string, string> = {
  '«': '<<',
  '‹': '<',
  '＜': '<',
  '〈': '<',
  '⟨': '<',
  '‘': '',
  '’': '',
};

const MRZ_CHARS = /[A-Z0-9<]/g;

function mrzRatio(line: string): number {
  return line.length ? (line.match(MRZ_CHARS)?.length ?? 0) / line.length : 0;
}

/**
 * Clean up pasted or OCR'd text: uppercase, map look-alike characters to `<`, remove
 * whitespace inside lines, split concatenated lines, and pick out the MRZ lines when the
 * text contains other content.
 */
export function normalizeMrz(input: string | readonly string[]): {
  lines: string[];
  warnings: Issue[];
} {
  const warnings: Issue[] = [];
  const text = (Array.isArray(input) ? input.join('\n') : String(input)).toUpperCase();
  let mapped = '';
  for (const c of text) mapped += LOOKALIKES[c] ?? c;

  let lines = mapped
    .split(/\r?\n|\r/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l.length > 0);

  // A single line holding a whole MRZ (pasted without line breaks).
  if (lines.length === 1) {
    const l = lines[0]!;
    if (l.length === 88) lines = [l.slice(0, 44), l.slice(44)];
    else if (l.length === 72) lines = [l.slice(0, 36), l.slice(36)];
    else if (l.length === 90) lines = [l.slice(0, 30), l.slice(30, 60), l.slice(60)];
  }

  // Text with surrounding noise (OCR of a whole page): keep MRZ-looking lines only.
  if (lines.length > 3 || lines.some((l) => l.length < 25)) {
    const mrzLike = lines.filter((l) => l.length >= 25 && mrzRatio(l) >= 0.9 && l.includes('<'));
    if (mrzLike.length >= 2 && mrzLike.length < lines.length) {
      warnings.push({
        code: 'extra_text_ignored',
        message: `Ignored ${lines.length - mrzLike.length} line(s) that do not look like MRZ text.`,
      });
      lines = mrzLike;
    }
    if (lines.length > 3) {
      const avg = lines.slice(-3).reduce((s, l) => s + l.length, 0) / 3;
      lines = Math.abs(avg - 30) <= 3 ? lines.slice(-3) : lines.slice(-2);
      warnings.push({
        code: 'extra_text_ignored',
        message: 'More than 3 candidate lines; used the last lines of the text.',
      });
    }
  }
  return { lines, warnings };
}

/** Maximum difference between a line's length and the format's line length that is repaired. */
const LENGTH_TOLERANCE = 3;

export interface Detection {
  format: MrzFormat | null;
  layout: Layout | null;
  lines: string[];
  /** Lines before any length adjustment. */
  rawLines: string[];
  warnings: Issue[];
  errors: Issue[];
}

/** Auto-detect the MRZ format from line count, line length and first character. */
export function detectFormat(lines: readonly string[]): Detection {
  const warnings: Issue[] = [];
  const errors: Issue[] = [];
  let format: MrzFormat | null = null;
  const visa = lines[0]?.startsWith('V') ?? false;
  const near = (n: number) => lines.every((l) => Math.abs(l.length - n) <= LENGTH_TOLERANCE);

  if (lines.length === 3 && near(30)) format = 'TD1';
  else if (lines.length === 2 && near(44)) format = visa ? 'MRVA' : 'TD3';
  else if (lines.length === 2 && near(36)) format = visa ? 'MRVB' : 'TD2';

  if (!format) {
    errors.push({
      code: 'unknown_format',
      message: `Could not recognize an MRZ format from ${lines.length} line(s) of length ${
        lines.map((l) => l.length).join(', ') || 0
      }. Expected 3×30 (TD1), 2×36 (TD2/MRV-B) or 2×44 (TD3/MRV-A).`,
    });
    return {
      format: null,
      layout: null,
      lines: [...lines],
      rawLines: [...lines],
      warnings,
      errors,
    };
  }

  const layout = LAYOUTS[format];
  const fixed = lines.map((l, i) => {
    if (l.length === layout.lineLength) return l;
    // Too long: drop characters from a trailing filler run (OCR may read fillers as K or L).
    const excess = l.length - layout.lineLength;
    const run = /<<[<KL]*$/.exec(l);
    const adjusted =
      excess > 0
        ? run && run[0].length - 2 >= excess
          ? l.slice(0, layout.lineLength)
          : l
        : l.padEnd(layout.lineLength, '<');
    if (adjusted.length !== layout.lineLength) {
      errors.push({
        code: 'line_length',
        field: `line${i + 1}`,
        message: `Line ${i + 1} has ${l.length} characters; ${format} lines have ${layout.lineLength}.`,
      });
      return adjusted.slice(0, layout.lineLength).padEnd(layout.lineLength, '<');
    }
    warnings.push({
      code: 'line_length_adjusted',
      message: `Line ${i + 1} had ${l.length} characters; ${
        l.length > layout.lineLength ? 'trailing fillers removed' : 'padded with fillers'
      } to ${layout.lineLength}.`,
    });
    return adjusted;
  });
  return { format, layout, lines: fixed, rawLines: [...lines], warnings, errors };
}
