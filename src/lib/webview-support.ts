/**
 * Détection des WebView Android trop anciennes pour rendre l'application.
 *
 * Tailwind v4 s'appuie sur `@layer`, `color-mix()`, `@property` et `:has()`.
 * Une WebView antérieure à Chrome 111 ignore ces constructions — et comme
 * ~90 % du CSS vit dans des blocs `@layer`, un navigateur qui ne les connaît
 * pas les saute intégralement : l'app s'affiche entièrement sans style.
 *
 * Ces fonctionnalités ne sont pas rétro-transposables (vérifié avec Lightning
 * CSS : aucune transformation possible, elles dépendent de variables résolues à
 * l'exécution). Le seul recours est donc de détecter le cas et de l'expliquer,
 * plutôt que de laisser l'utilisateur devant une page cassée.
 *
 * Le piège : la WebView ne suit PAS la version d'Android. Elle se met à jour
 * via le Play Store, indépendamment. Un appareil récent peut porter une WebView
 * ancienne, et inversement.
 */

/** Version de Chrome minimale pour que le CSS de l'app soit interprété. */
export const MIN_CHROME_VERSION = 111;

/**
 * Version de Chrome/WebView extraite de l'user-agent, ou `null` si absente
 * (navigateur non-Chromium : Safari, Firefox — hors sujet ici).
 */
export function getChromeMajorVersion(): number | null {
  if (typeof navigator === "undefined") return null;
  const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
  return m ? Number(m[1]) : null;
}

/**
 * `true` si l'on est sur un moteur Chromium trop ancien pour rendre l'app.
 *
 * Test de capacité en complément de la version : `CSS.supports` sur les deux
 * fonctionnalités réellement bloquantes. Un moteur pourrait annoncer une
 * version ancienne tout en les supportant (ou l'inverse sur un fork).
 */
export function isUnsupportedWebView(): boolean {
  if (typeof window === "undefined") return false;

  const supportsLayer = typeof CSS !== "undefined" && CSS.supports?.("selector(:has(*))");
  const supportsColorMix =
    typeof CSS !== "undefined" && CSS.supports?.("color", "color-mix(in srgb, red, blue)");
  if (supportsLayer && supportsColorMix) return false;

  const version = getChromeMajorVersion();
  // Moteur non-Chromium sans ces API : on ne bloque pas, le cas n'existe pas
  // sur les plateformes visées et un faux positif serait pire.
  if (version === null) return false;
  return version < MIN_CHROME_VERSION;
}
