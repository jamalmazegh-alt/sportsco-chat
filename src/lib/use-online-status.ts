import { useEffect, useState } from "react";

/**
 * État de connexion réseau, via `navigator.onLine` et les événements
 * `online`/`offline`.
 *
 * Pas de plugin Capacitor ici : ces API fonctionnent aussi bien en WKWebView
 * qu'en WebView Android et sur le web, et évitent une dépendance de plus.
 *
 * Limite connue de `navigator.onLine` : il signale l'existence d'une interface
 * réseau, pas l'accès effectif à Internet. Un portail captif ou un backend
 * injoignable restent donc vus comme « en ligne » — c'est un indicateur, pas
 * une garantie, et les erreurs de requête restent gérées ailleurs.
 */
export function useOnlineStatus(): boolean {
  // SSR et premier rendu : on suppose en ligne pour ne pas afficher un
  // bandeau d'alerte à tort le temps de l'hydratation.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") return;

    setOnline(navigator.onLine);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
