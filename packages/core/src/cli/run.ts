import { parseArgs } from 'node:util';
import { parseMrz } from '../parse.js';
import { toPassenger, validForTravel, type Title } from '../travel/index.js';
import type { MrzResult } from '../types.js';

export const USAGE = `Usage: passport-mrz [options] "<MRZ line 1>" "<MRZ line 2>" ["<MRZ line 3>"]
       passport-mrz [options] --image photo.jpg      (needs passport-mrz-ocr)
       cat mrz.txt | passport-mrz [options]

Reads and validates a passport / ID card / visa MRZ and prints JSON. Runs entirely offline.

Options:
  --travel-date YYYY-MM-DD     check validity and passenger type on this date
  --return-date YYYY-MM-DD     return date for the validity and passenger type checks
  --min-months N               months of validity required after return/travel (default 6)
  --reference-date YYYY-MM-DD  date used for century inference (default today)
  --adult-female-title MS|MRS  title for adult women (default MS)
  --image PATH                 read the MRZ from a photo with passport-mrz-ocr
  --no-correct                 disable checksum-guided OCR correction
  --compact                    print JSON on one line
  -h, --help                   show this help
  -v, --version                show the version

Exit codes: 0 valid (and travel check passed), 1 invalid MRZ or travel check failed,
            2 usage error, 3 OCR package not installed or OCR failed.`;

export interface CliIo {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /** Returns stdin contents, or null when stdin is a terminal. */
  readStdin: () => Promise<string | null>;
  importOcr: () => Promise<OcrModule>;
  version: string;
}

export interface OcrModule {
  readMrzFromFile: (
    path: string,
    options?: { parse?: Parameters<typeof parseMrz>[1] },
  ) => Promise<{ mrz: MrzResult; ocr: unknown }>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'travel-date': { type: 'string' },
        'return-date': { type: 'string' },
        'min-months': { type: 'string' },
        'reference-date': { type: 'string' },
        'adult-female-title': { type: 'string' },
        image: { type: 'string' },
        'no-correct': { type: 'boolean' },
        compact: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    io.stderr(`${e instanceof Error ? e.message : String(e)}\n\n${USAGE}\n`);
    return 2;
  }
  const v = args.values;
  if (v.help) {
    io.stdout(USAGE + '\n');
    return 0;
  }
  if (v.version) {
    io.stdout(io.version + '\n');
    return 0;
  }
  for (const key of ['travel-date', 'return-date', 'reference-date'] as const) {
    if (v[key] !== undefined && !DATE.test(v[key]!)) {
      io.stderr(`--${key} must be YYYY-MM-DD\n`);
      return 2;
    }
  }
  const minMonths = v['min-months'] === undefined ? 6 : Number(v['min-months']);
  if (!Number.isInteger(minMonths) || minMonths < 0) {
    io.stderr('--min-months must be a non-negative integer\n');
    return 2;
  }
  const femaleTitle = v['adult-female-title']?.toUpperCase();
  if (femaleTitle && femaleTitle !== 'MS' && femaleTitle !== 'MRS') {
    io.stderr('--adult-female-title must be MS or MRS\n');
    return 2;
  }

  const parseOptions = {
    referenceDate: v['reference-date'],
    correct: !v['no-correct'],
  };
  let mrz: MrzResult;
  let ocr: unknown;
  if (v.image) {
    let mod: OcrModule;
    try {
      mod = await io.importOcr();
    } catch {
      io.stderr(
        '--image needs the optional OCR package. Install it next to passport-mrz:\n  npm install passport-mrz-ocr\n',
      );
      return 3;
    }
    try {
      const out = await mod.readMrzFromFile(v.image, { parse: parseOptions });
      mrz = out.mrz;
      ocr = out.ocr;
    } catch (e) {
      io.stderr(`OCR failed: ${e instanceof Error ? e.message : String(e)}\n`);
      return 3;
    }
  } else {
    let text = args.positionals.join('\n');
    if (!text) text = (await io.readStdin()) ?? '';
    if (!text.trim()) {
      io.stderr(`No MRZ given.\n\n${USAGE}\n`);
      return 2;
    }
    mrz = parseMrz(text, parseOptions);
  }

  const travelDate = v['travel-date'];
  const returnDate = v['return-date'];
  const output: Record<string, unknown> = {
    valid: mrz.valid,
    passenger: toPassenger(mrz, {
      travelDate: travelDate ?? v['reference-date'],
      returnDate,
      titles: femaleTitle ? { adultFemale: femaleTitle as Title } : undefined,
    }),
  };
  let travelOk = true;
  if (travelDate) {
    const travel = validForTravel(mrz, { travelDate, returnDate, minMonthsValidity: minMonths });
    output.travel = travel;
    travelOk = travel.ok;
  }
  output.mrz = mrz;
  if (ocr !== undefined) output.ocr = ocr;
  io.stdout(JSON.stringify(output, null, v.compact ? undefined : 2) + '\n');
  return mrz.valid && travelOk ? 0 : 1;
}
