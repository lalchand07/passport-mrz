// ICAO Doc 9303 specimen MRZs (fictitious state "UTO"), recalled from general knowledge
// of Doc 9303 — the text was not compared with the official document (see
// docs/FORMAT_NOTES.md). Every check digit has been verified computationally.
export const SPECIMENS = {
  td3: [
    'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
    'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
  ],
  td1: [
    'I<UTOD231458907<<<<<<<<<<<<<<<',
    '7408122F1204159UTO<<<<<<<<<<<6',
    'ERIKSSON<<ANNA<MARIA<<<<<<<<<<',
  ],
  td1Long: [
    'I<UTOD23145890<7349<<<<<<<<<<<',
    '3407127M9507122UTO<<<<<<<<<<<2',
    'STEVENSON<<PETER<JOHN<<<<<<<<<',
  ],
  td2: ['I<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<', 'D231458907UTO7408122F1204159<<<<<<<6'],
  mrva: [
    'V<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
    'L8988901C4XXX4009078F96121096ZE184226B<<<<<<',
  ],
  mrvb: ['V<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<', 'L8988901C4XXX4009078F9612109<<<<<<<<'],
} as const;

/** Reference date used across tests so century inference is deterministic. */
export const REF = '2026-10-17';
