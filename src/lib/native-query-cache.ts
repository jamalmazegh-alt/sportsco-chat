/**
 * Persistance du cache de requêtes, en natif uniquement.
 *
 * L'écran d'accueil déclenche une quinzaine d'appels réseau au premier
 * affichage, sans loader : tout part du client après le montage. Sur le web
 * c'est indolore — même origine, connexion chaude, multiplexage. En natif
 * chaque appel est inter-origine, et au démarrage à froid il faut établir DNS,
 * TLS et connexion avant le moindre octet utile. D'où l'écran vide pendant que
 * les données arrivent.
 *
 * En conservant le cache d'une session à l'autre, l'écran s'affiche
 * immédiatement avec les données de la dernière visite, puis se rafraîchit en
 * arrière-plan. C'est ce qui distingue une application qu'on trouve rapide.
 *
 * **Natif uniquement, à dessein.** Le web n'a pas le problème, et persister y
 * ferait courir un risque sans contrepartie : des données périmées affichées à
 * un utilisateur qui n'a jamais eu à les attendre.
 */
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { isNativePlatform } from "@/lib/native-platform";

const STORAGE_KEY = "clubero.query-cache";

/** Au-delà, on repart de zéro plutôt que d'afficher des données d'une autre semaine. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Le stockage local d'une WebView est contraint (quelques mégaoctets). Un cache
 * trop gros échoue à l'écriture — silencieusement — et on perd tout le
 * bénéfice. On écarte donc les entrées volumineuses plutôt que de risquer un
 * dépassement de quota.
 */
const MAX_ENTRY_BYTES = 100_000;

export function installNativeQueryCache(queryClient: QueryClient): void {
  if (!isNativePlatform()) return;

  try {
    // Imports STATIQUES, à dessein. Un import dynamique ferait arriver la
    // restauration APRÈS le premier rendu — trop tard pour éviter l'écran vide,
    // qui est tout l'objet de ce fichier. Le stockage local étant synchrone, la
    // relecture est immédiate dès lors que le module est déjà là.
    // Coût sur le web : quelques kilo-octets jamais exécutés, grâce à la garde.
    persistQueryClient({
      queryClient,
      persister: createSyncStoragePersister({ storage: window.localStorage, key: STORAGE_KEY }),
      maxAge: MAX_AGE_MS,
      // Le cache est lié au code qui l'a produit : une nouvelle version peut
      // avoir changé la forme des données. On repart alors de zéro plutôt que
      // d'hydrater des objets devenus incompatibles.
      buster: import.meta.env.VITE_BUILD_ID ?? "",
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
          if (query.state.status !== "success") return false;
          try {
            return JSON.stringify(query.state.data).length <= MAX_ENTRY_BYTES;
          } catch {
            // Donnée non sérialisable : l'écarter plutôt que de faire échouer
            // l'écriture de tout le cache.
            return false;
          }
        },
      },
    });
  } catch (e) {
    // Stockage indisponible ou saturé : l'application continue sans cache
    // persistant, simplement aussi lente qu'avant.
    console.warn("[query-cache] persistance indisponible:", (e as Error).message);
  }
}
