/**
 * Israeli teudat zehut check digit. Mirrors backend/app/core/israeli_id.py.
 *
 * Random 9-digit strings fail this ~90% of the time — which is why the national ID
 * is optional and validated, and the internal MRN is the key.
 * Client-side validation is a convenience only; the server validates again.
 */

/**
 * Common separators people type into an ID field. Anything else — letters in
 * particular — makes the input invalid rather than being silently stripped:
 * "abcdefghij0" must not reduce to "0" and then validate as 000000000.
 */
const SEPARATORS = /[\s\-.]/g;
const DIGITS_ONLY = /^\d{1,9}$/;

export function normaliseNationalId(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.replace(SEPARATORS, '');
  if (!DIGITS_ONLY.test(candidate)) return null;
  return candidate.padStart(9, '0');
}

export function isValidIsraeliId(value: string | null | undefined): boolean {
  const digits = normaliseNationalId(value);
  if (digits === null) return false;

  let total = 0;
  for (let index = 0; index < 9; index += 1) {
    const doubled = Number(digits[index]) * (index % 2 === 0 ? 1 : 2);
    total += doubled < 10 ? doubled : doubled - 9;
  }
  return total % 10 === 0;
}

export function maskNationalId(value: string | null): string {
  if (!value) return '—';
  return `•••••${value.slice(-4)}`;
}
