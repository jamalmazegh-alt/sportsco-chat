/**
 * B13 — URL Google Maps robuste pour un lieu texte (adresse ou nom).
 * Encode correctement query ; ignore les chaînes vides.
 */
export function googleMapsSearchUrl(location: string | null | undefined): string | null {
  const q = location?.trim();
  if (!q) return null;
  // Déjà une URL Maps → la renvoyer telle quelle.
  if (/^https?:\/\//i.test(q) && /google\.com\/maps|maps\.google/i.test(q)) {
    return q;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
