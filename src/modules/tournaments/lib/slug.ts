/** Slugify simple pour URLs publiques (/t/$slug). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Suffixe court aléatoire pour désambiguïser. */
export function shortRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}
