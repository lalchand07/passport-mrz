import { parseMrz, type MrzResult } from 'passport-mrz';
import { generateMrz } from 'passport-mrz/generate';
import {
  airlineName,
  passengerType,
  toPassenger,
  validForTravel,
  type Title,
} from 'passport-mrz/travel';
import type { OcrEngine, ReadResult } from 'passport-mrz-ocr/browser';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const mrzInput = $<HTMLTextAreaElement>('mrz');
const travelInput = $<HTMLInputElement>('travel-date');
const returnInput = $<HTMLInputElement>('return-date');
const monthsInput = $<HTMLInputElement>('min-months');
const titleInput = $<HTMLSelectElement>('female-title');
const results = $('results');
const ocrStatus = $('ocr-status');
const ocrReport = $('ocr-report');

let lastOcr: ReadResult['ocr'] | null = null;

/** Tiny DOM builder; all text goes through textContent (no HTML injection). */
function h(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null)[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c !== null) el.append(c);
  return el;
}

/** Append children, skipping nulls. */
const add = (parent: HTMLElement, ...children: (Node | string | null)[]) =>
  parent.append(...children.filter((c): c is Node | string => c !== null));

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
travelInput.value = iso(new Date(today.getTime() + 30 * 864e5));

const CHECK_LABELS: Record<string, string> = {
  documentNumber: 'Document number',
  birthDate: 'Date of birth',
  expiryDate: 'Expiry date',
  personalNumber: 'Personal number',
  composite: 'Composite',
};

const FORMAT_LABELS: Record<string, string> = {
  TD1: 'TD1 — ID card (3 × 30)',
  TD2: 'TD2 — ID card / travel document (2 × 36)',
  TD3: 'TD3 — passport (2 × 44)',
  MRVA: 'MRV-A — visa (2 × 44)',
  MRVB: 'MRV-B — visa (2 × 36)',
};

function fieldRows(r: MrzResult): HTMLElement {
  const f = r.fields;
  const rows: [string, string | null, boolean?][] = [
    ['Document type', f.documentType && `${f.documentType} (${f.documentCode ?? ''})`],
    [
      'Issuing state',
      f.issuingState && `${f.issuingState} — ${f.issuingStateName ?? 'unknown code'}`,
    ],
    ['Surname', f.surname],
    ['Given names', f.givenNames],
    ['Document number', f.documentNumber, true],
    ['Nationality', f.nationality && `${f.nationality} — ${f.nationalityName ?? 'unknown code'}`],
    ['Date of birth', f.birthDate ?? f.birthDateRaw],
    ['Sex', f.sex ?? 'unspecified'],
    ['Expiry date', f.expiryDate ?? f.expiryDateRaw],
    ['Personal number', f.personalNumber, true],
    ['Optional data', f.optionalData1, true],
    ['Optional data 2', f.optionalData2, true],
  ];
  return h(
    'table',
    {},
    ...rows
      .filter(([, v]) => v)
      .map(([k, v, mono]) =>
        h('tr', {}, h('th', { scope: 'row' }, k), h('td', mono ? { class: 'mono' } : {}, v!)),
      ),
  );
}

function render(): void {
  const text = mrzInput.value;
  results.replaceChildren(h('h2', { id: 'results-h' }, '3. Result'));
  if (!text.trim()) {
    results.append(h('p', { class: 'muted' }, 'Paste an MRZ or add a photo to see the result.'));
    return;
  }
  const r = parseMrz(text);
  const travelDate = travelInput.value || iso(today);
  const returnDate = returnInput.value || undefined;
  const titles = { adultFemale: titleInput.value as Title };

  results.append(
    h(
      'div',
      { class: 'status' },
      h(
        'span',
        { class: `pill ${r.valid ? 'ok' : 'bad'}` },
        r.valid ? 'Valid MRZ' : 'Problems found',
      ),
      r.format ? h('span', { class: 'muted' }, FORMAT_LABELS[r.format] ?? r.format) : null,
      h('span', { class: 'pill warn' }, 'beta'),
      r.corrections.length
        ? h('span', { class: 'pill warn' }, `${r.corrections.length} correction(s)`)
        : null,
      lastOcr?.reviewRecommended
        ? h('span', { class: 'pill warn' }, 'Read from a photo: compare with the document')
        : null,
    ),
  );

  if (r.format) {
    results.append(h('h3', {}, 'Fields'), fieldRows(r));

    results.append(
      h('h3', {}, 'Check digits'),
      h(
        'div',
        { class: 'checks' },
        ...r.checks.map((c) =>
          h(
            'div',
            { class: `check ${c.valid ? 'ok' : 'bad'}` },
            h('strong', {}, `${c.valid ? '✓' : '✗'} ${CHECK_LABELS[c.name] ?? c.name}`),
            `printed ${c.printed}, computed ${c.computed ?? '–'}${c.corrected ? ' (after correction)' : ''}`,
          ),
        ),
      ),
    );
  }

  if (r.corrections.length) {
    results.append(
      h('h3', {}, 'Corrections made'),
      h(
        'table',
        {},
        h('tr', {}, h('th', {}, 'Field'), h('th', {}, 'Read → corrected')),
        ...r.corrections.map((c) =>
          h(
            'tr',
            {},
            h('td', {}, `${c.field} (${c.reason})`),
            h('td', { class: 'mono' }, `${c.original} → ${c.corrected}`),
          ),
        ),
      ),
    );
  }
  if (r.ambiguities.length) {
    results.append(
      h('h3', {}, 'Not corrected (ambiguous)'),
      h(
        'ul',
        { class: 'notes' },
        ...r.ambiguities.map((a) =>
          h('li', {}, `${a.field}: ${a.original} could be ${a.candidates.join(', ')}`),
        ),
      ),
    );
  }

  if (r.format) {
    const travel = validForTravel(r, {
      travelDate,
      returnDate,
      minMonthsValidity: Number(monthsInput.value) || 0,
    });
    const pt = passengerType(r.fields.birthDate, travelDate, { returnDate });
    const name = airlineName(r, { travelDate, titles });
    add(
      results,
      h('h3', {}, 'Travel check'),
      h(
        'p',
        { class: `travel ${travel.ok ? 'ok' : 'bad'}` },
        `${travel.ok ? '✓' : '✗'} ${travel.message}`,
      ),
      travel.mrzValid
        ? null
        : h('p', { class: 'muted' }, 'The MRZ did not validate, so the dates may be misread.'),
      h('h3', {}, 'Passenger'),
      h(
        'p',
        {},
        h('strong', {}, pt.type ?? '–'),
        pt.age !== null ? ` (age ${pt.age} on ${travelDate})` : '',
        pt.note ? h('span', { class: 'muted' }, ` — ${pt.note}`) : null,
      ),
      h('div', { class: 'airline' }, name.name),
      name.warnings.length
        ? h('ul', { class: 'notes' }, ...name.warnings.map((w) => h('li', { class: 'warning' }, w)))
        : null,
    );
  }

  const notes = [
    ...r.errors.map((e) => h('li', { class: 'error' }, e.message)),
    ...r.warnings
      .filter((w) => w.code !== 'corrected')
      .map((w) => h('li', { class: 'warning' }, w.message)),
  ];
  if (notes.length) results.append(h('h3', {}, 'Messages'), h('ul', { class: 'notes' }, ...notes));

  const copy = h('button', { type: 'button', class: 'button' }, 'Copy as JSON');
  copy.addEventListener('click', async () => {
    const json = JSON.stringify(
      {
        passenger: toPassenger(r, { travelDate, returnDate, titles }),
        travel: r.format
          ? validForTravel(r, {
              travelDate,
              returnDate,
              minMonthsValidity: Number(monthsInput.value) || 0,
            })
          : null,
        mrz: r,
        ocr: lastOcr,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed — select the MRZ text manually';
    }
    setTimeout(() => (copy.textContent = 'Copy as JSON'), 2000);
  });
  results.append(h('div', { class: 'row' }, copy));
}

// --- OCR (loaded on first use) ---------------------------------------------------------
let enginePromise: Promise<{
  engine: OcrEngine;
  read: typeof import('passport-mrz-ocr/browser').readMrzFromImage;
}> | null = null;

function loadEngine() {
  enginePromise ??= import('passport-mrz-ocr/browser').then(async (m) => ({
    engine: await m.createBrowserEngine(new URL('./ocr/', document.baseURI).href, {
      logger: (p) => {
        if (p.status.startsWith('loading')) ocrStatus.textContent = `Loading OCR (${p.status})…`;
      },
    }),
    read: m.readMrzFromImage,
  }));
  return enginePromise;
}

async function handleImage(file: File | undefined): Promise<void> {
  if (!file) return;
  ocrReport.hidden = true;
  ocrStatus.textContent = 'Loading the OCR engine on this device…';
  try {
    const { engine, read } = await loadEngine();
    ocrStatus.textContent = 'Reading the MRZ…';
    const t = performance.now();
    const out = await read(file, { engine });
    lastOcr = out.ocr;
    mrzInput.value = out.mrz.input.join('\n');
    ocrStatus.textContent = `Read in ${((performance.now() - t) / 1000).toFixed(1)} s · OCR confidence ${out.ocr.confidence} · ${
      out.ocr.confirmed ? 'confirmed by a second read' : 'not confirmed'
    }`;
    const corrected = out.ocr.correctedLines.map((i) => i + 1);
    ocrReport.replaceChildren(
      corrected.length ? h('p', {}, `Corrected line(s): ${corrected.join(', ')}`) : '',
      out.ocr.reviewRecommended
        ? h(
            'div',
            {},
            h('span', { class: 'pill warn' }, 'Please compare with the photo'),
            h(
              'ul',
              { class: 'notes' },
              ...out.ocr.reviewReasons.map((x) => h('li', { class: 'warning' }, x)),
            ),
          )
        : h('span', { class: 'pill ok' }, 'Read cleanly'),
    );
    ocrReport.hidden = false;
    render();
  } catch (e) {
    ocrStatus.textContent = `OCR failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

$<HTMLInputElement>('camera').addEventListener('change', (e) =>
  handleImage((e.target as HTMLInputElement).files?.[0]),
);
$<HTMLInputElement>('upload').addEventListener('change', (e) =>
  handleImage((e.target as HTMLInputElement).files?.[0]),
);

let sampleSeed = 1;
$('sample').addEventListener('click', () => {
  const formats = ['TD3', 'TD1', 'TD2', 'MRVA', 'MRVB'] as const;
  const g = generateMrz({
    format: formats[sampleSeed % formats.length],
    seed: Date.now() % 100000,
  });
  sampleSeed++;
  mrzInput.value = g.text;
  lastOcr = null;
  ocrReport.hidden = true;
  ocrStatus.textContent = 'Synthetic sample: every name and number is invented.';
  render();
});
$('clear').addEventListener('click', () => {
  mrzInput.value = '';
  lastOcr = null;
  ocrReport.hidden = true;
  ocrStatus.textContent = '';
  render();
});

mrzInput.addEventListener('input', () => {
  lastOcr = null;
});
for (const el of [mrzInput, travelInput, returnInput, monthsInput, titleInput]) {
  el.addEventListener('input', render);
}
render();
