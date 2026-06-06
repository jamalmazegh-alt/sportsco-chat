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

/**
 * Retourne un slug unique pour la table `tournaments`. Essaie d'abord `base`,
 * puis ajoute un suffixe aléatoire si le slug est déjà pris.
 * Source unique partagée entre tournaments.functions.ts et passes.functions.ts.
 */
export async function uniqueTournamentSlug(
  supabaseAdmin: { from: (t: string) => any },
  base: string,
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${shortRandomSuffix()}`;
    const { data } = await supabaseAdmin
      .from("tournaments")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${shortRandomSuffix()}`;
}
