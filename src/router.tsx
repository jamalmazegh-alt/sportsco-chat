import { QueryClient } from "@tanstack/react-query";
import { installNativeQueryCache } from "@/lib/native-query-cache";
import { createRouter } from "@tanstack/react-router";
import { RouteNotFound } from "@/components/route-not-found";
import { routeTree } from "./routeTree.gen";
import { GlobalErrorBoundary } from "./components/global-error-boundary";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Le cache doit survivre au démontage assez longtemps pour être écrit
        // sur disque et relu au lancement suivant.
        gcTime: 24 * 60 * 60 * 1000,
        // AUCUNE durée de fraîcheur globale, à dessein. Elle réduirait les
        // allers-retours, mais empêcherait la première requête à l'arrivée sur
        // un écran : sur un tournoi, on verrait un score figé jusqu'au sondage
        // suivant — 20 à 30 secondes. Le cache persistant supprime l'écran
        // vide ; la fraîcheur reste exactement celle d'aujourd'hui, chaque
        // requête repartant au montage.
        //
        // 41 fichiers définissent déjà leur propre `staleTime` là où c'est
        // pertinent : c'est la bonne granularité, pas un réglage global.
      },
    },
  });

  // Natif : réafficher les données de la dernière visite au lieu d'un écran
  // vide pendant que la quinzaine de requêtes de l'accueil revient.
  installNativeQueryCache(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error, reset }) => (
      <GlobalErrorBoundary error={error} reset={reset} />
    ),
    defaultNotFoundComponent: RouteNotFound,
  });

  return router;
};
