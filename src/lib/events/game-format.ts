/**
 * Format de jeu d'un événement — extraction et libellé.
 *
 * L'assistant de création n'a pas de colonne pour le format : il l'écrit en
 * tête de la description, sous la forme `Format: 11v11 · 2x45 min`. Rendue
 * telle quelle, cette ligne technique atterrit dans le bloc « description »,
 * entre les consignes du coach et les pièces jointes, là où personne ne la
 * cherche.
 *
 * On la sort donc du texte pour la remonter en sous-titre, où elle appartient :
 * « Football à 11 (2×45 min) » se lit d'un coup d'œil, sous le nom du match.
 *
 * Purement textuel, donc testable sans rendu ni base.
 */

export interface ParsedGameFormat {
  /** Brut, tel que saisi : `"11v11"`, ou une valeur libre. */
  format: string | null;
  /** Brut : `"2x45"`, `"best-of-3"`. */
  halves: string | null;
  /** La description privée de sa ligne `Format:`. */
  rest: string;
}

/**
 * Isole la ligne `Format:` d'une description.
 *
 * Le séparateur écrit par l'assistant est un point médian, et le suffixe
 * « min » appartient à la mise en forme, pas à la donnée : les deux sautent.
 * Une description sans ligne `Format:` revient inchangée.
 */
export function parseGameFormat(description: string | null | undefined): ParsedGameFormat {
  const raw = description ?? "";
  const match = raw.match(/(^|\n)[ \t]*Format[ \t]*:[ \t]*([^\n]*)/i);
  if (!match) return { format: null, halves: null, rest: raw.trim() };

  const [first, second] = match[2].split("·").map((part) => part.trim());
  const format = first || null;
  const halves = second ? second.replace(/\s*min\.?$/i, "").trim() || null : null;

  return { format, halves, rest: raw.replace(match[0], "").trim() };
}

/**
 * Nombre de joueurs par équipe, si le format en désigne un.
 *
 * `"11v11"` → 11. Un format asymétrique — improbable mais saisissable à la
 * main — retourne le premier nombre, celui de notre équipe. Tout le reste
 * (`"best-of-3"`, texte libre) ne donne pas de compte et sera affiché tel quel.
 */
export function gameFormatPlayerCount(format: string | null | undefined): number | null {
  if (!format) return null;
  const match = /^(\d+)\s*v\s*(\d+)$/i.exec(format.trim());
  if (!match) return null;
  const count = parseInt(match[1], 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

/** Périodes et durée d'une période, si le format des mi-temps en donne. */
export function parseHalves(halves: string | null | undefined): {
  periods: number;
  minutes: number;
} | null {
  if (!halves) return null;
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(halves.trim());
  if (!match) return null;
  const periods = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (!periods || !minutes) return null;
  return { periods, minutes };
}

/**
 * Majuscule sur la seule initiale.
 *
 * `capitalize` en CSS relève chaque mot : il rend « Samedi 14 Mars » et, pire,
 * « Football À 11 ». Ici on ne touche qu'au premier caractère.
 */
export function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Nombre de manches d'un format `best-of-N`, sinon `null`. */
export function parseBestOf(halves: string | null | undefined): number | null {
  if (!halves) return null;
  const match = /^best-of-(\d+)$/i.exec(halves.trim());
  if (!match) return null;
  const count = parseInt(match[1], 10);
  return count > 0 ? count : null;
}
