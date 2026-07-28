/**
 * Stale chunk guard.
 *
 * Après un déploiement, un onglet déjà ouvert (ou une PWA restaurée depuis
 * l'écran d'accueil) référence des chunks JS hachés qui n'existent plus sur
 * le CDN. Le chargement paresseux d'une route échoue alors avec :
 *   - "Importing a module script failed." (Safari / iOS)
 *   - "Failed to fetch dynamically imported module" (Chrome)
 *   - "error loading dynamically imported module" (Firefox)
 *
 * Ce n'est pas un bug applicatif : il suffit de recharger pour récupérer le
 * HTML à jour. On recharge donc automatiquement une seule fois par session
 * (garde sessionStorage) pour éviter toute boucle si le problème persiste.
 */

const RELOAD_FLAG = "clubero:stale-chunk-reloaded";

const PATTERNS = [
  "importing a module script failed",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "'text/html' is not a valid javascript mime type",
  "expected a javascript module script",
];

export function isStaleChunkError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? `${error.name} ${error.message}`
        : "";
  const lower = message.toLowerCase();
  return PATTERNS.some((p) => lower.includes(p));
}

/** Recharge une fois par session si l'erreur vient d'un chunk obsolète. */
export function recoverFromStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isStaleChunkError(error)) return false;
  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG)) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage indisponible (mode privé) : on tente quand même un reload.
  }
  window.location.reload();
  return true;
}

/** Écoute les erreurs de préchargement Vite et les rejets non gérés. */
export function installStaleChunkGuard() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    if (recoverFromStaleChunk(payload)) event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => {
    recoverFromStaleChunk(event.reason);
  });
}
