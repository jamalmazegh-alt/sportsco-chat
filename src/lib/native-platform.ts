/**
 * Détection de la plateforme native SANS importer `@capacitor/core`.
 *
 * Le runtime Capacitor injecte `window.Capacitor` avant le chargement du bundle
 * applicatif. Lire ce global plutôt qu'importer le SDK garantit que le build web
 * reste strictement inchangé : aucun octet de Capacitor n'atterrit en production.
 *
 * Les modules qui ont réellement besoin des plugins (`@capacitor/app`, etc.)
 * doivent les importer dynamiquement, derrière un `isNativePlatform()`.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function getCapacitorGlobal(): CapacitorGlobal | undefined {
  return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** `true` uniquement dans une WebView iOS/Android pilotée par Capacitor. */
export function isNativePlatform(): boolean {
  const cap = getCapacitorGlobal();
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true;
}

/** `"ios"` | `"android"` | `"web"` — `"web"` par défaut hors runtime natif. */
export function getPlatform(): string {
  const cap = getCapacitorGlobal();
  return typeof cap?.getPlatform === "function" ? cap.getPlatform() : "web";
}

/**
 * Origine du backend distant, injectée au build mobile via `VITE_API_ORIGIN`.
 * Vide sur le build web : les appels restent relatifs, comme aujourd'hui.
 */
export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  return raw ? raw.replace(/\/+$/, "") : "";
}
