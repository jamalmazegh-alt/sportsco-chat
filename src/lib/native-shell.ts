/**
 * Coquille native Capacitor — lot 5 mobile.
 *
 * Câble les comportements que la WebView seule ne fournit pas : masquage du
 * splash, style de la barre d'état, bouton retour matériel Android.
 *
 * Imports STATIQUES des plugins : un import dynamique laisse une promesse
 * pendante en WKWebView (constaté au lot 3, cf. `native-push.ts`). Les gardes
 * `isNativePlatform()` suffisent à neutraliser tout ceci sur le web, où les
 * proxies de plugins ne sont jamais invoqués.
 */
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { isNativePlatform, getPlatform } from "@/lib/native-platform";

let initDone = false;

/**
 * À appeler une fois, au montage de la racine — donc avant même le login.
 * No-op complet hors plateforme native.
 */
export function initNativeShell(): void {
  if (!isNativePlatform() || initDone) return;
  initDone = true;

  // Le splash reste sinon affiché jusqu'au timeout par défaut du plugin, ce qui
  // ajoute une attente inutile à chaque lancement alors que la WebView est prête.
  SplashScreen.hide().catch((e) => {
    console.warn("[native-shell] splash hide failed:", (e as Error).message);
  });

  // `Default` suit l'apparence système, cohérent avec le sélecteur
  // Clair/Sombre/Auto du profil. Sans appel explicite, iOS peut conserver un
  // style hérité du splash et rendre l'heure illisible sur fond clair.
  StatusBar.setStyle({ style: Style.Default }).catch((e) => {
    console.warn("[native-shell] status bar style failed:", (e as Error).message);
  });

  // Bouton retour matériel Android : sans écouteur, il ferme l'application au
  // lieu de revenir en arrière. On délègue à l'historique du navigateur, que
  // TanStack Router alimente ; à la racine on laisse l'OS fermer l'app, ce qui
  // est le comportement attendu sur Android.
  if (getPlatform() === "android") {
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    }).catch((e) => {
      console.warn("[native-shell] back button listener failed:", (e as Error).message);
    });
  }
}
