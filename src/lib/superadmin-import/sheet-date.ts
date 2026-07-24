/**
 * Parsing de dates robuste et non-ambigu pour l'import de joueurs.
 *
 * Le classeur est lu avec `XLSX.read(buf, { cellDates: true, raw: true })` :
 * les cellules date sortent en objets `Date` natifs (indépendants du format
 * régional). Ce module encapsule :
 *   1. la conversion d'un `Date` SheetJS en `YYYY-MM-DD` TZ-safe,
 *   2. la validation calendaire stricte d'une chaîne ISO,
 *   3. le parsing tolérant d'une chaîne (DD/MM, MM/DD, ISO, série Excel)
 *      qui refuse explicitement les cas ambigus au lieu de deviner.
 *
 * Aucun import Node — utilisable client & serveur.
 */

/** `Date` → `YYYY-MM-DD` en composants locaux (pas de décalage TZ). */
export function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Valide qu'une chaîne est un vrai jour calendaire ISO (round-trip). */
export function isStrictIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export type ParsedDate = { iso: string; ambiguous: false } | { iso: null; ambiguous: boolean };

/**
 * Parse une chaîne date "utilisateur" en ISO strict.
 *  - `YYYY-MM-DD` : accepté tel quel.
 *  - `dd/mm/yyyy` ou `mm/dd/yyyy` (séparateurs `/ - .`) : ordre déduit
 *    uniquement si un des deux composants est > 12. Sinon `ambiguous: true`.
 *  - série Excel numérique : convertie en ISO.
 *  - toute date incohérente (mois > 12, jour > 31, 31 février, …) : `iso: null`.
 */
export function parseFlexibleDate(input: string): ParsedDate {
  const trimmed = input.trim();
  if (!trimmed) return { iso: null, ambiguous: false };
  if (isStrictIsoDate(trimmed)) return { iso: trimmed, ambiguous: false };

  const m = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const yRaw = m[3];
    const yNum = Number(yRaw);
    const y = yRaw.length === 2 ? (yNum > 30 ? 1900 + yNum : 2000 + yNum) : yNum;
    let day: number;
    let mo: number;
    if (a > 12 && b <= 12) {
      day = a;
      mo = b;
    } else if (b > 12 && a <= 12) {
      day = b;
      mo = a;
    } else if (a <= 12 && b <= 12) {
      return { iso: null, ambiguous: true };
    } else {
      return { iso: null, ambiguous: false };
    }
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return isStrictIsoDate(iso) ? { iso, ambiguous: false } : { iso: null, ambiguous: false };
  }

  const n = Number(trimmed);
  if (!Number.isNaN(n) && n > 10000 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`;
    return isStrictIsoDate(iso) ? { iso, ambiguous: false } : { iso: null, ambiguous: false };
  }

  return { iso: null, ambiguous: false };
}

/**
 * Normalise une cellule brute renvoyée par SheetJS (`raw: true`,
 * `cellDates: true`) pour qu'elle soit sérialisable JSON et non ambiguë :
 *  - `Date`  → `YYYY-MM-DD` (local),
 *  - `string`→ trim,
 *  - reste  → inchangé.
 */
export function normalizeSheetCell(v: unknown): unknown {
  if (v instanceof Date && !isNaN(v.getTime())) return dateToIso(v);
  if (typeof v === "string") return v.trim();
  return v;
}
