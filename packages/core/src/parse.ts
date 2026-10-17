import { computeCheckDigit } from './checkDigit.js';
import { lookupCountry } from './countries.js';
import { correctLines, checkPasses, resolveCheck } from './correct.js';
import { parseMrzDate, toSimpleDate, compareDates, type SimpleDate } from './dates.js';
import { fieldDef, readField, type Layout } from './formats.js';
import { repairLineLengths } from './length.js';
import { parseName } from './names.js';
import { detectFormat, normalizeMrz } from './normalize.js';
import type {
  CheckResult,
  DocumentType,
  Issue,
  MrzFields,
  MrzResult,
  ParseOptions,
  RawField,
  Sex,
} from './types.js';

const CHECK_LABEL: Record<string, string> = {
  documentNumber: 'document number',
  birthDate: 'date of birth',
  expiryDate: 'expiry date',
  personalNumber: 'personal number',
  composite: 'composite',
};

function emptyFields(): MrzFields {
  return {
    documentCode: null,
    documentType: null,
    issuingState: null,
    issuingStateName: null,
    surname: null,
    givenNames: null,
    nameTruncated: false,
    documentNumber: null,
    nationality: null,
    nationalityName: null,
    birthDate: null,
    birthDateRaw: null,
    sex: null,
    expiryDate: null,
    expiryDateRaw: null,
    personalNumber: null,
    optionalData1: null,
    optionalData2: null,
  };
}

function failure(errors: Issue[], input: string[] = [], warnings: Issue[] = []): MrzResult {
  return {
    valid: false,
    format: null,
    beta: true,
    input,
    lines: input,
    fields: emptyFields(),
    checks: [],
    corrections: [],
    ambiguities: [],
    errors,
    warnings,
  };
}

function documentType(code: string): DocumentType {
  switch (code[0]) {
    case 'P':
      return 'passport';
    case 'I':
    case 'A':
    case 'C':
      return 'id-card';
    case 'V':
      return 'visa';
    default:
      return 'other';
  }
}

const EXPECTED_CODES: Record<string, string> = {
  TD3: 'P',
  TD1: 'IAC',
  TD2: 'IACP',
  MRVA: 'V',
  MRVB: 'V',
};

const stripFiller = (s: string) => {
  const v = s.replace(/<+$/, '');
  return v.length ? v : null;
};

function referenceOf(options: ParseOptions): SimpleDate {
  return toSimpleDate(options.referenceDate ?? new Date()) ?? toSimpleDate(new Date())!;
}

/**
 * Parse and validate an MRZ (TD1, TD2, TD3, MRV-A, MRV-B). Accepts the MRZ as one string
 * (lines separated by newlines, or concatenated) or as an array of lines.
 *
 * Never throws: problems are reported in `errors` and `warnings`.
 */
export function parseMrz(input: string | readonly string[], options: ParseOptions = {}): MrzResult {
  try {
    return parseUnsafe(input, options);
  } catch (e) {
    return failure([
      {
        code: 'internal_error',
        message: `Unexpected error: ${e instanceof Error ? e.message : String(e)}`,
      },
    ]);
  }
}

function parseUnsafe(input: string | readonly string[], options: ParseOptions): MrzResult {
  if (
    typeof input !== 'string' &&
    !(Array.isArray(input) && input.every((l) => typeof l === 'string'))
  ) {
    return failure([
      { code: 'invalid_input', message: 'Input must be a string or an array of strings.' },
    ]);
  }
  const normalized = normalizeMrz(input);
  if (!normalized.lines.length) {
    return failure([{ code: 'no_mrz_found', message: 'No MRZ text found in the input.' }]);
  }
  const detection = detectFormat(normalized.lines);
  const warnings = [...normalized.warnings, ...detection.warnings];
  const errors = [...detection.errors];
  if (!detection.layout) return failure(errors, detection.lines, warnings);
  const layout = detection.layout;
  let inputLines = detection.lines;
  if (options.correct !== false && detection.rawLines.some((l) => l.length !== layout.lineLength)) {
    const repaired = repairLineLengths(
      detection.rawLines,
      detection.lines,
      layout,
      options.maxSubstitutions ?? 2,
    );
    if (repaired.warnings.length) {
      inputLines = repaired.lines;
      warnings.push(...repaired.warnings);
      // The repair supersedes the plain length errors for the repaired lines.
      const fixed = new Set(repaired.repaired.map((i) => `line${i + 1}`));
      for (let i = errors.length - 1; i >= 0; i--) {
        if (errors[i]!.code === 'line_length' && fixed.has(errors[i]!.field ?? ''))
          errors.splice(i, 1);
      }
    }
  }

  // Characters outside the MRZ alphabet.
  inputLines.forEach((l, i) => {
    const bad = [...new Set(l.replace(/[A-Z0-9<]/g, ''))];
    if (bad.length) {
      errors.push({
        code: 'invalid_characters',
        message: `Line ${i + 1} contains characters outside A-Z, 0-9 and <: ${bad.join(' ')}`,
      });
    }
  });

  let lines = inputLines;
  let corrections: MrzResult['corrections'] = [];
  let ambiguities: MrzResult['ambiguities'] = [];
  if (options.correct !== false) {
    const out = correctLines(inputLines, layout, options.maxSubstitutions ?? 2);
    lines = out.lines;
    corrections = out.corrections;
    ambiguities = out.ambiguities;
    warnings.push(...out.warnings);
    for (const c of corrections) {
      warnings.push({
        code: 'corrected',
        field: c.field,
        message: `Corrected ${c.field} from "${c.original}" to "${c.corrected}" (${c.reason}).`,
      });
    }
  }

  const grid = lines.map((l) => [...l]);
  const checks: CheckResult[] = [];
  const changed = new Set(
    corrections.flatMap((c) => c.changes.map((x) => `${x.line}:${x.position}`)),
  );
  let longDocumentNumber = false;
  for (const check of layout.checks) {
    const rc = resolveCheck(layout, check, lines);
    if (!rc) continue;
    if (rc.longDocumentNumber) longDocumentNumber = true;
    const data = rc.covered.map((p) => grid[p[0]]![p[1]]!).join('');
    const printed = grid[rc.digit[0]]![rc.digit[1]]!;
    const valid = checkPasses(grid, rc);
    checks.push({
      name: check.name,
      valid,
      computed: computeCheckDigit(data),
      printed,
      corrected: [...rc.covered, rc.digit].some((p) => changed.has(`${p[0]}:${p[1]}`)),
    });
    if (!valid) {
      errors.push({
        code: 'check_digit_failed',
        field: check.name,
        message: `The ${CHECK_LABEL[check.name]} check digit is "${printed}" but the data gives ${
          computeCheckDigit(data) ?? 'no valid digit'
        }.`,
      });
    }
  }

  const fields = extractFields(layout, lines, longDocumentNumber, options, errors, warnings);
  return {
    valid: errors.length === 0,
    format: layout.format,
    beta: true,
    input: inputLines,
    lines,
    fields,
    checks,
    corrections,
    ambiguities,
    errors,
    warnings,
  };
}

function extractFields(
  layout: Layout,
  lines: string[],
  longDocumentNumber: boolean,
  options: ParseOptions,
  errors: Issue[],
  warnings: Issue[],
): MrzFields {
  const fields = emptyFields();
  const raw = (name: RawField) => {
    const d = fieldDef(layout, name);
    return d ? readField(lines, d) : null;
  };
  const reference = referenceOf(options);

  const code = raw('documentCode')!;
  fields.documentCode = stripFiller(code);
  fields.documentType = documentType(code);
  if (!EXPECTED_CODES[layout.format]!.includes(code[0]!)) {
    warnings.push({
      code: 'unexpected_document_code',
      field: 'documentCode',
      message: `Document code "${code}" is unusual for ${layout.format}.`,
    });
  }

  for (const key of ['issuingState', 'nationality'] as const) {
    const value = raw(key)!;
    const info = lookupCountry(value);
    fields[key] = info.code || null;
    fields[key === 'issuingState' ? 'issuingStateName' : 'nationalityName'] = info.name;
    if (info.kind === 'unknown') {
      warnings.push({
        code: 'unknown_country_code',
        field: key,
        message: `Unknown country code "${value}".`,
      });
    }
  }

  const name = parseName(raw('name')!);
  fields.surname = name.surname || null;
  fields.givenNames = name.givenNames || null;
  fields.nameTruncated = name.truncated;
  if (name.truncated) {
    warnings.push({
      code: 'name_truncated',
      field: 'name',
      message:
        'The name field is completely filled; the name was probably truncated. Check it against the visual zone.',
    });
  }
  if (/[^A-Z<]/.test(raw('name')!)) {
    warnings.push({
      code: 'invalid_name_characters',
      field: 'name',
      message: 'The name contains digits or symbols.',
    });
  }

  const docNumber = raw('documentNumber')!;
  const opt1 = raw('optionalData1');
  if (longDocumentNumber && opt1) {
    const end = opt1.indexOf('<');
    const overflow = end < 0 ? opt1 : opt1.slice(0, end);
    fields.documentNumber = docNumber + overflow.slice(0, -1);
    fields.optionalData1 = stripFiller(end < 0 ? '' : opt1.slice(end + 1));
  } else {
    fields.documentNumber = stripFiller(docNumber);
    fields.optionalData1 = opt1 === null ? null : stripFiller(opt1);
  }
  const opt2 = raw('optionalData2');
  fields.optionalData2 = opt2 === null ? null : stripFiller(opt2);
  const personal = raw('personalNumber');
  fields.personalNumber = personal === null ? null : stripFiller(personal);

  for (const key of ['birthDate', 'expiryDate'] as const) {
    const value = raw(key)!;
    const parsed = parseMrzDate(
      value,
      key === 'birthDate' ? 'birth' : 'expiry',
      reference,
      options.expiryMaxYearsAhead ?? 20,
    );
    fields[key === 'birthDate' ? 'birthDateRaw' : 'expiryDateRaw'] = value;
    fields[key] = parsed.iso;
    const label = key === 'birthDate' ? 'date of birth' : 'expiry date';
    if (parsed.status === 'invalid') {
      errors.push({
        code: 'invalid_date',
        field: key,
        message: `The ${label} "${value}" is not a valid date.`,
      });
    } else if (parsed.status === 'missing' || parsed.status === 'unknown') {
      warnings.push({
        code: parsed.status === 'missing' ? 'date_missing' : 'date_partially_unknown',
        field: key,
        message: `The ${label} "${value}" is ${parsed.status === 'missing' ? 'not given' : 'partially unknown'}.`,
      });
    } else if (key === 'expiryDate' && parsed.date && compareDates(parsed.date, reference) < 0) {
      warnings.push({
        code: 'document_expired',
        field: key,
        message: `The document expired on ${parsed.iso}.`,
      });
    }
  }

  const sex = raw('sex')!;
  if (sex === 'M' || sex === 'F') fields.sex = sex as Sex;
  else if (sex === 'X') {
    fields.sex = 'X';
    warnings.push({ code: 'sex_x', field: 'sex', message: 'Sex is given as "X" (unspecified).' });
  } else if (sex !== '<') {
    errors.push({
      code: 'invalid_sex',
      field: 'sex',
      message: `Sex "${sex}" is not M, F, X or <.`,
    });
  }
  return fields;
}
