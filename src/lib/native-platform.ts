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
 * `false` dans les applications distribuées par un store (iOS ET Android).
 *
 * Apple (règle 3.1.1) comme Google (Play Payments policy) imposent leur propre
 * système d'achat pour les abonnements numériques consommés dans l'app. Plutôt
 * que d'intégrer StoreKit et Play Billing pour la v1, les parcours d'achat sont
 * retirés des builds natifs : l'abonnement se souscrit et se gère sur le web.
 *
 * Ne concerne QUE l'abonnement SaaS du club. Les paiements de cotisations, de
 * stages et de tournois portent sur des services du monde réel et restent
 * autorisés hors achat in-app — ils ne doivent pas être masqués.
 */
export function canPurchaseInApp(): boolean {
  return !isNativePlatform();
}

/**
 * Origine du backend distant, injectée au build mobile via `VITE_API_ORIGIN`.
 * Vide sur le build web : les appels restent relatifs, comme aujourd'hui.
 */
export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  return raw ? raw.replace(/\/+$/, "") : "";
}

/**
 * Absolutise un chemin d'API pour l'app native.
 *
 * Dans la WebView, l'origine est `capacitor://localhost` ou `https://localhost` :
 * un `fetch("/api/chat")` vise le bundle embarqué, pas le serveur, et échoue
 * silencieusement. Les RPC de server functions sont déjà réécrites par
 * `serverFns.fetch` (src/start.ts), mais tout appel `fetch` direct y échappe —
 * c'est ce qui cassait l'assistant IA, dont le transport est celui de l'AI SDK.
 *
 * Sur le web, renvoie le chemin inchangé : les appels restent relatifs.
 */
export function apiUrl(path: string): string {
  if (!isNativePlatform()) return path;
  const origin = getApiOrigin();
  return origin && path.startsWith("/") ? `${origin}${path}` : path;
}
