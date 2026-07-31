import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { isNativePlatform } from "@/lib/native-platform";

/**
 * État de connexion réseau.
 *
 * En natif, la source de vérité est `@capacitor/network`, adossé à l'API de
 * connectivité de l'OS. Le web, lui, s'appuie sur `navigator.onLine` et les
 * événements `online`/`offline`.
 *
 * Pourquoi le plugin en natif : une première version n'utilisait que
 * `navigator.onLine`, et le test en simulateur (Wi-Fi coupé puis rétabli) a
 * montré que WKWebView émet bien `offline` mais **jamais** `online` — le
 * bandeau apparaissait et ne repartait plus. Un indicateur qui ne sait pas
 * s'éteindre est pire qu'aucun indicateur.
 *
 * Limite conservée dans les deux cas : on détecte l'interface réseau, pas
 * l'accès effectif à Internet. Un portail captif reste vu comme « en ligne ».
 */
export function useOnlineStatus(): boolean {
  // SSR et premier rendu : on suppose en ligne pour ne pas afficher un
  // bandeau d'alerte à tort le temps de l'hydratation.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isNativePlatform()) {
      const removers: Array<() => void> = [];

      const refresh = () =>
        Network.getStatus()
          .then((status) => setOnline(status.connected))
          .catch((e) => console.warn("[network] getStatus failed:", (e as Error).message));

      refresh();

      Network.addListener("networkStatusChange", (status) => setOnline(status.connected))
        .then((handle) => removers.push(() => void handle.remove()))
        .catch((e) => console.warn("[network] listener failed:", (e as Error).message));

      // Filet de sécurité : un changement d'état réseau survenu pendant que
      // l'app était suspendue n'émet pas toujours d'événement. Sans cette
      // re-lecture au retour au premier plan, un bandeau « hors ligne » peut
      // rester affiché alors que la connexion est revenue.
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) refresh();
      })
        .then((handle) => removers.push(() => void handle.remove()))
        .catch((e) => console.warn("[network] appState listener failed:", (e as Error).message));

      return () => removers.forEach((remove) => remove());
    }

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
