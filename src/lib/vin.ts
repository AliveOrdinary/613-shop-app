// Vehicle identification numbers (17 characters, never I, O or Q).

const VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Upper-cases and strips spaces and dashes. Returns null for an empty field. */
export function normalizeVin(raw: string): string | null {
  const v = raw.replace(/[\s-]/g, "").toUpperCase();
  return v === "" ? null : v;
}

export type VinCheck =
  | { ok: true; checkDigitOk: boolean }
  | { ok: false; reason: string };

/**
 * Checks the shape of a VIN. The check digit (9th character) is required on North American
 * vehicles but not on some imports, so a bad check digit is reported, not rejected.
 */
export function checkVin(vin: string): VinCheck {
  if (vin.length !== 17) return { ok: false, reason: `A VIN has 17 characters; this one has ${vin.length}.` };
  if (/[IOQ]/.test(vin)) return { ok: false, reason: "A VIN never contains I, O or Q. Check for 1 and 0." };
  if (!/^[A-Z0-9]{17}$/.test(vin)) return { ok: false, reason: "A VIN has only letters and numbers." };
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin.charAt(i);
    const value = /\d/.test(ch) ? Number(ch) : VALUES[ch];
    sum += value * WEIGHTS[i];
  }
  const r = sum % 11;
  const expected = r === 10 ? "X" : String(r);
  return { ok: true, checkDigitOk: vin.charAt(8) === expected };
}

/** Model year from the 10th character, picking the most recent year that isn't in the future. */
export function vinModelYear(vin: string, now = new Date()): number | null {
  const codes = "ABCDEFGHJKLMNPRSTVWXY123456789";
  const i = codes.indexOf(vin.charAt(9));
  if (i < 0) return null;
  const latest = now.getFullYear() + 1;
  let year = 1980 + i;
  while (year + 30 <= latest) year += 30;
  return year;
}
