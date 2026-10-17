export interface ParsedName {
  surname: string;
  givenNames: string;
  /** The name field is completely filled, so the name was probably truncated. */
  truncated: boolean;
}

const clean = (s: string) => s.replace(/</g, ' ').replace(/\s+/g, ' ').trim();

/** Split an MRZ name field into primary (surname) and secondary (given names) identifiers. */
export function parseName(field: string): ParsedName {
  const truncated = field.length > 0 && !field.endsWith('<');
  const body = field.replace(/<+$/, '');
  const sep = body.indexOf('<<');
  if (sep < 0) return { surname: clean(body), givenNames: '', truncated };
  return { surname: clean(body.slice(0, sep)), givenNames: clean(body.slice(sep + 2)), truncated };
}
