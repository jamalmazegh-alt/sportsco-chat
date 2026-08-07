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

/**
 * `true` si la donnée contient une `Map` ou un `Set`, à quelque profondeur que
 * ce soit. JSON les aplatit en objets vides sans le signaler — la valeur
 * restaurée garde alors la forme attendue mais perd ses méthodes.
 */
function containsMapOrSet(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== "object") return false;
  if (value instanceof Map || value instanceof Set) return true;
  if (Array.isArray(value)) return value.some((v) => containsMapOrSet(v, depth + 1));
  return Object.values(value as Record<string, unknown>).some((v) =>
    containsMapOrSet(v, depth + 1),
  );
}

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
      // Incrémenter à CHAQUE changement de ce qu'on persiste. Un cache déjà
      // écrit sur un appareil survit à la mise à jour de l'application : sans
      // ce marqueur, les utilisateurs qui ont enregistré une Map aplatie en
      // `{}` continueraient de planter malgré le correctif. `VITE_BUILD_ID`
      // seul ne suffit pas — il n'est pas défini sur tous les builds.
      buster: `v2-${import.meta.env.VITE_BUILD_ID ?? ""}`,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
          if (query.state.status !== "success") return false;
          try {
            const json = JSON.stringify(query.state.data);
            if (json.length > MAX_ENTRY_BYTES) return false;
            // JSON ne sait pas représenter Map ni Set : il les rend en `{}`.
            // Restaurée, la donnée aurait la bonne forme apparente mais plus
            // aucune méthode — `counts.get(...)` casse l'écran d'accueil, où
            // une requête renvoie `{ sent: Set, counts: Map }`. Détecté en
            // production. On écarte ces entrées : mieux vaut les recharger que
            // les ressusciter mutilées.
            return !containsMapOrSet(query.state.data);
          } catch {
            // Donnée non sérialisable du tout : l'écarter plutôt que de faire
            // échouer l'écriture de tout le cache.
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
