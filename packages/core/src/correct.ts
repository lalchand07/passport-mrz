import { isValidCheckDigit } from './checkDigit.js';
import { isKnownCountry } from './countries.js';
import { fieldDef, readField, type CheckDef, type Layout } from './formats.js';
import type {
  Ambiguity,
  CharChange,
  CharClass,
  CheckName,
  Correction,
  CorrectionReason,
  Issue,
  RawField,
} from './types.js';

/** Letters OCR commonly reads in place of a digit. */
export const DIGIT_FOR_LETTER: Readonly<Record<string, string>> = {
  O: '0',
  D: '0',
  Q: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
};

/** Digits OCR commonly reads in place of a letter (most likely first). */
export const LETTERS_FOR_DIGIT: Readonly<Record<string, readonly string[]>> = {
  '0': ['O', 'D'],
  '1': ['I'],
  '2': ['Z'],
  '5': ['S'],
  '6': ['G'],
  '8': ['B'],
};

const isDigit = (c: string) => c >= '0' && c <= '9';
const isLetter = (c: string) => c >= 'A' && c <= 'Z';

/** Plausible OCR substitutions for `c` in a position of class `cls`. */
export function alternatives(c: string, cls: CharClass): string[] {
  if (cls === 'digit') return isLetter(c) && DIGIT_FOR_LETTER[c] ? [DIGIT_FOR_LETTER[c]!] : [];
  if (cls === 'alpha') return isDigit(c) ? [...(LETTERS_FOR_DIGIT[c] ?? [])] : [];
  // alnum
  if (isDigit(c)) return [...(LETTERS_FOR_DIGIT[c] ?? [])];
  if (isLetter(c)) {
    const alts = DIGIT_FOR_LETTER[c] ? [DIGIT_FOR_LETTER[c]!] : [];
    if (c === 'K') alts.push('<'); // OCR often reads the filler as K
    return alts;
  }
  return [];
}

export type Pos = readonly [line: number, index: number];

export interface ResolvedCheck {
  name: CheckName;
  /** Field the check protects (for reporting). */
  field: RawField;
  covered: Pos[];
  digit: Pos;
  /** True for the TD1/TD2 long document number layout. */
  longDocumentNumber: boolean;
}

function positions(line: number, start: number, end: number): Pos[] {
  const out: Pos[] = [];
  for (let i = start; i < end; i++) out.push([line, i]);
  return out;
}

/**
 * Work out which positions a check covers on the given lines. Handles the TD1/TD2 long
 * document number rule: check digit position holds `<` and the number continues in the
 * optional data, followed by its check digit and a filler.
 */
export function resolveCheck(
  layout: Layout,
  check: CheckDef,
  lines: readonly string[],
): ResolvedCheck | null {
  const digitDef = fieldDef(layout, check.digit);
  if (!digitDef) return null;
  const digit: Pos = [digitDef.line, digitDef.start];
  if (check.ranges) {
    const covered = check.ranges.flatMap(([l, s, e]) => positions(l, s, e));
    return { name: check.name, field: check.digit, covered, digit, longDocumentNumber: false };
  }
  const def = fieldDef(layout, check.field!);
  if (!def) return null;
  const covered = positions(def.line, def.start, def.start + def.length);
  if (check.name === 'documentNumber' && (layout.format === 'TD1' || layout.format === 'TD2')) {
    const line = lines[digit[0]] ?? '';
    const opt = fieldDef(layout, 'optionalData1')!;
    const optText = readField(lines, opt);
    const end = optText.indexOf('<');
    // Overflow needs at least one extra character plus its check digit.
    if (line[digit[1]] === '<' && end !== 0 && (end < 0 ? optText.length : end) >= 2) {
      const len = end < 0 ? optText.length : end;
      return {
        name: check.name,
        field: check.field!,
        covered: [...covered, ...positions(opt.line, opt.start, opt.start + len - 1)],
        digit: [opt.line, opt.start + len - 1],
        longDocumentNumber: true,
      };
    }
  }
  return { name: check.name, field: check.field!, covered, digit, longDocumentNumber: false };
}

type Grid = string[][];

const at = (g: Grid, p: Pos) => g[p[0]]![p[1]]!;

export function checkPasses(g: Grid, rc: ResolvedCheck): boolean {
  return isValidCheckDigit(rc.covered.map((p) => at(g, p)).join(''), at(g, rc.digit));
}

function applyChanges(g: Grid, changes: readonly CharChange[]): void {
  for (const c of changes) g[c.line]![c.position] = c.to;
}

function revertChanges(g: Grid, changes: readonly CharChange[]): void {
  for (const c of changes) g[c.line]![c.position] = c.from;
}

const SEARCH_BUDGET = 200_000;

/**
 * Find the smallest sets of class-consistent substitutions that make `rc` pass.
 * Returns `[]` when no such set exists within `maxK` substitutions.
 */
export function searchCheck(
  g: Grid,
  rc: ResolvedCheck,
  classAt: (p: Pos) => CharClass,
  maxK: number,
  frozen: ReadonlySet<string> = new Set(),
): CharChange[][] {
  if (checkPasses(g, rc)) return [[]];
  const slots = [...rc.covered, rc.digit]
    .filter((p) => !frozen.has(`${p[0]}:${p[1]}`))
    .map((p) => ({ p, alts: alternatives(at(g, p), p === rc.digit ? 'digit' : classAt(p)) }))
    .filter((s) => s.alts.length > 0);
  let budget = SEARCH_BUDGET;

  for (let k = 1; k <= Math.min(maxK, slots.length); k++) {
    const found: CharChange[][] = [];
    const chosen: CharChange[] = [];
    const recurse = (startSlot: number): void => {
      if (budget <= 0) return;
      if (chosen.length === k) {
        budget--;
        applyChanges(g, chosen);
        if (checkPasses(g, rc)) found.push([...chosen]);
        revertChanges(g, chosen);
        return;
      }
      for (let i = startSlot; i < slots.length; i++) {
        const { p, alts } = slots[i]!;
        for (const to of alts) {
          chosen.push({ line: p[0], position: p[1], from: at(g, p), to });
          recurse(i + 1);
          chosen.pop();
        }
      }
    };
    recurse(0);
    if (found.length) return found;
  }
  return [];
}

export interface CorrectionOutput {
  lines: string[];
  corrections: Correction[];
  ambiguities: Ambiguity[];
  warnings: Issue[];
}

interface Logged {
  change: CharChange;
  reason: CorrectionReason;
}

/**
 * Checksum-guided OCR correction. Changes are only accepted when they are consistent with
 * each position's character class and, for checked fields, when exactly one minimal
 * substitution set (optionally disambiguated by the composite check) makes the check pass.
 */
export function correctLines(
  inputLines: readonly string[],
  layout: Layout,
  maxK = 2,
): CorrectionOutput {
  const g: Grid = inputLines.map((l) => [...l]);
  const log: Logged[] = [];
  const warnings: Issue[] = [];
  const ambiguities: Ambiguity[] = [];

  const commit = (changes: readonly CharChange[], reason: CorrectionReason) => {
    applyChanges(g, changes);
    for (const change of changes) log.push({ change, reason });
  };
  const lines = () => g.map((r) => r.join(''));

  // Character class per position.
  const classes: CharClass[][] = g.map((r) => r.map(() => 'alnum' as CharClass));
  for (const d of layout.fields)
    for (let i = 0; i < d.length; i++) classes[d.line]![d.start + i] = d.cls;
  const classAt = (p: Pos) => classes[p[0]]![p[1]]!;

  // 1. Filler: in a name field, nothing but fillers may follow a run of 3+ fillers.
  const nameDef = fieldDef(layout, 'name')!;
  const name = readField(lines(), nameDef);
  const run = name.indexOf('<<<');
  if (run >= 0) {
    const changes: CharChange[] = [];
    for (let i = run; i < name.length; i++) {
      if (name[i] !== '<' && /[KXCE]/.test(name[i]!)) {
        changes.push({ line: nameDef.line, position: nameDef.start + i, from: name[i]!, to: '<' });
      }
    }
    const tail = name.slice(run).replace(/</g, '');
    if (changes.length && changes.length === tail.length) commit(changes, 'filler');
  }

  // 2. Character-class repairs (letters in digit fields, digits in letter fields).
  for (const d of layout.fields) {
    if (d.name === 'sex' || d.name === 'documentCode') continue;
    const value = readField(lines(), d);
    if (d.name === 'issuingState' || d.name === 'nationality') {
      if (!/[0-9]/.test(value)) continue;
      let options = [''];
      for (const c of value) {
        const alts = isDigit(c) ? (LETTERS_FOR_DIGIT[c] ?? [c]) : [c];
        options = options.flatMap((o) => alts.map((a) => o + a));
      }
      const known = options.filter((o) => isKnownCountry(o));
      if (known.length === 1) {
        const target = known[0]!;
        const changes: CharChange[] = [];
        for (let i = 0; i < value.length; i++) {
          if (value[i] !== target[i])
            changes.push({ line: d.line, position: d.start + i, from: value[i]!, to: target[i]! });
        }
        commit(changes, 'character-class');
      }
      continue;
    }
    const changes: CharChange[] = [];
    for (let i = 0; i < value.length; i++) {
      const c = value[i]!;
      let to: string | undefined;
      if (d.cls === 'digit' && isLetter(c)) to = DIGIT_FOR_LETTER[c];
      else if (d.cls === 'alpha' && isDigit(c)) to = LETTERS_FOR_DIGIT[c]?.[0];
      if (to) changes.push({ line: d.line, position: d.start + i, from: c, to });
    }
    commit(changes, 'character-class');
  }

  // 3. Check-digit search on failing field checks.
  const fieldChecks = layout.checks.filter((c) => !c.ranges);
  const compositeDef = layout.checks.find((c) => c.ranges);
  const failing: { rc: ResolvedCheck; cands: CharChange[][] }[] = [];
  for (const check of fieldChecks) {
    const rc = resolveCheck(layout, check, lines());
    if (!rc || checkPasses(g, rc)) continue;
    failing.push({ rc, cands: searchCheck(g, rc, classAt, maxK) });
  }

  const fieldValue = (rc: ResolvedCheck, changes: readonly CharChange[]) => {
    applyChanges(g, changes);
    const v = rc.covered.map((p) => at(g, p)).join('');
    revertChanges(g, changes);
    return v;
  };
  const reportAmbiguous = (rc: ResolvedCheck, cands: CharChange[][]) => {
    const candidates = [...new Set(cands.map((c) => fieldValue(rc, c)))];
    const original = fieldValue(rc, []);
    ambiguities.push({ check: rc.name, field: rc.field, original, candidates });
    warnings.push({
      code: 'correction_ambiguous',
      field: rc.field,
      message: `Check digit for ${rc.field} fails and ${candidates.length} different corrections (${candidates
        .slice(0, 5)
        .join(', ')}${candidates.length > 5 ? ', …' : ''}) would fix it; none was applied.`,
    });
  };

  const solvable = failing.filter((f) => f.cands.length > 0);
  const compositeRc = compositeDef ? resolveCheck(layout, compositeDef, lines()) : null;
  const multi = solvable.filter((f) => f.cands.length > 1);

  if (multi.length && compositeRc) {
    // Use the composite check digit to choose between candidates.
    let combos: CharChange[][][] = [[]];
    for (const f of solvable) {
      combos = combos.flatMap((combo) => f.cands.map((c) => [...combo, c]));
      if (combos.length > 20_000) break;
    }
    const passing =
      combos.length <= 20_000
        ? combos.filter((combo) => {
            const all = combo.flat();
            applyChanges(g, all);
            const ok = checkPasses(g, compositeRc);
            revertChanges(g, all);
            return ok;
          })
        : [];
    if (passing.length === 1) {
      passing[0]!.forEach((changes, i) =>
        commit(changes, solvable[i]!.cands.length > 1 ? 'check-digit+composite' : 'check-digit'),
      );
    } else {
      for (const f of solvable) {
        if (f.cands.length === 1) commit(f.cands[0]!, 'check-digit');
        else reportAmbiguous(f.rc, f.cands);
      }
    }
  } else {
    for (const f of solvable) {
      if (f.cands.length === 1) commit(f.cands[0]!, 'check-digit');
      else reportAmbiguous(f.rc, f.cands);
    }
  }

  // 4. Composite fails while every field check passes: the error is in data only the
  //    composite covers (optional data) or in the composite digit itself.
  if (compositeRc && !checkPasses(g, compositeRc)) {
    const current = lines();
    const allFieldChecksPass = layout.checks
      .filter((c) => !c.ranges)
      .every((c) => {
        const rc = resolveCheck(layout, c, current);
        return !rc || checkPasses(g, rc);
      });
    if (allFieldChecksPass) {
      const frozen = new Set<string>();
      for (const c of fieldChecks) {
        const rc = resolveCheck(layout, c, current);
        if (rc) for (const p of [...rc.covered, rc.digit]) frozen.add(`${p[0]}:${p[1]}`);
      }
      const cands = searchCheck(g, compositeRc, classAt, maxK, frozen);
      if (cands.length === 1 && cands[0]!.length) {
        commit(cands[0]!, 'composite');
        warnings.push({
          code: 'correction_composite_only',
          message:
            'A correction was made using only the composite check digit; verify the optional data against the document.',
        });
      } else if (cands.length > 1) {
        reportAmbiguous({ ...compositeRc, field: 'compositeCheckDigit' }, cands);
      }
    }
  }

  // Group the log into per-field corrections.
  const corrections: Correction[] = [];
  const original = inputLines;
  const final = lines();
  for (const d of layout.fields) {
    const entries = log.filter(
      (e) =>
        e.change.line === d.line &&
        e.change.position >= d.start &&
        e.change.position < d.start + d.length,
    );
    if (!entries.length) continue;
    const before = readField(original, d);
    const after = readField(final, d);
    if (before === after) continue;
    const changes = entries
      .map((e) => e.change)
      .filter(
        (c, i, arr) =>
          arr.findLastIndex((x) => x.position === c.position && x.line === c.line) === i,
      )
      .map((c) => ({ ...c, from: original[c.line]![c.position]! }))
      .filter((c) => c.from !== c.to);
    corrections.push({
      field: d.name,
      reason: entries[entries.length - 1]!.reason,
      original: before,
      corrected: after,
      changes,
    });
  }
  return { lines: final, corrections, ambiguities, warnings };
}
