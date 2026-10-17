import { ISO_COUNTRIES } from './data/countries.js';
import type { CountryInfo } from './types.js';

/**
 * Codes used in MRZs that are not ISO 3166-1 alpha-3 country codes. Written from general
 * knowledge of ICAO Doc 9303 Part 3 — to be verified against the official text.
 */
export const ICAO_SPECIAL_CODES: Readonly<Record<string, string>> = {
  D: 'Germany',
  GBD: 'British Overseas Territories Citizen',
  GBN: 'British National (Overseas)',
  GBO: 'British Overseas Citizen',
  GBP: 'British Protected Person',
  GBS: 'British Subject',
  UNO: 'United Nations Organization',
  UNA: 'Specialized agency of the United Nations',
  UNK: 'Resident of Kosovo (UNMIK travel document)',
  RKS: 'Kosovo',
  EUE: 'European Union',
  XOM: 'Sovereign Military Order of Malta',
  XPO: 'International Criminal Police Organization (INTERPOL)',
  XBA: 'African Development Bank',
  XIM: 'African Export-Import Bank',
  XCC: 'Caribbean Community (CARICOM)',
  XCE: 'Council of Europe',
  XCO: 'Common Market for Eastern and Southern Africa (COMESA)',
  XEC: 'Economic Community of West African States (ECOWAS)',
  XDC: 'Southern African Development Community (SADC)',
  XES: 'Organisation of Eastern Caribbean States (OECS)',
  XXA: 'Stateless person',
  XXB: 'Refugee (1951 Convention)',
  XXC: 'Refugee (other)',
  XXX: 'Unspecified nationality',
  UTO: 'Utopia (ICAO specimen state)',
};

/** Look up an MRZ country code (`D<<` and `D` both mean Germany). */
export function lookupCountry(raw: string): CountryInfo {
  const code = raw.replace(/<+$/, '');
  const special = ICAO_SPECIAL_CODES[code];
  if (special) return { code, name: special, kind: 'icao' };
  const iso = ISO_COUNTRIES[code];
  if (iso) return { code, name: iso, kind: 'iso' };
  return { code, name: null, kind: 'unknown' };
}

export function isKnownCountry(raw: string): boolean {
  return lookupCountry(raw).kind !== 'unknown';
}
