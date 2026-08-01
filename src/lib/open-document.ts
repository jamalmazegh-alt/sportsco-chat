/**
 * Ouverture d'un document (pièce jointe du mur, docuthèque, chat…).
 *
 * Sur le web, `window.open` suffit. Dans la WebView Android/iOS, un
 * `target="_blank"` ne fait **rien** : la WebView n'a pas de notion d'onglet et
 * avale la navigation. Les documents du mur étaient donc inouvrables depuis
 * l'app native. On passe par `@capacitor/browser`, qui ouvre un Chrome Custom
 * Tab (Android) / SFSafariViewController (iOS) capable d'afficher ou de
 * télécharger un PDF.
 *
 * Import STATIQUE du plugin, à dessein : l'import dynamique ne se résout jamais
 * dans la WKWebView (même spike que `native-push.ts` — promesse pendante, ni
 * valeur ni rejet). Coût sur le build web : quelques Ko d'un proxy inerte,
 * jamais invoqué grâce à la garde `isNativePlatform()`.
 */
import { Browser } from "@capacitor/browser";
import { isNativePlatform } from "@/lib/native-platform";

export async function openDocument(url: string): Promise<void> {
  if (!url) return;
  if (!isNativePlatform()) {
    // Pas de chaîne de « window features » : elle forcerait une popup (souvent
    // bloquée silencieusement) au lieu d'un véritable onglet.
    window.open(url, "_blank");
    return;
  }
  try {
    await Browser.open({ url });
  } catch (e) {
    // Un échec du bridge ne doit pas laisser l'utilisateur sans rien : on
    // retombe sur la navigation WebView, qui vaut mieux qu'un clic mort.
    console.warn("[open-document] Browser.open failed:", (e as Error).message);
    window.open(url, "_blank");
  }
}

/**
 * Téléchargement d'un document (URL servie avec `Content-Disposition:
 * attachment`). On n'ouvre **aucune** fenêtre : une popup n'aurait rien à
 * afficher et se ferait bloquer. Sur le web, `location.href` déclenche le
 * téléchargement sans quitter la page. En natif, seule une ouverture par le
 * navigateur système sait télécharger depuis une WebView.
 */
export async function downloadDocument(url: string): Promise<void> {
  if (!url) return;
  if (!isNativePlatform()) {
    window.location.href = url;
    return;
  }
  try {
    await Browser.open({ url });
  } catch (e) {
    console.warn("[open-document] Browser.open (download) failed:", (e as Error).message);
    window.location.href = url;
  }
}


/**
 * Handler de clic pour un `<a href>` : conserve les sémantiques web (clic
 * milieu, « ouvrir dans un nouvel onglet », copie du lien) et ne dévie vers le
 * navigateur natif que sur mobile.
 */
export function handleDocumentClick(e: React.MouseEvent, url: string): void {
  if (!isNativePlatform()) return;
  e.preventDefault();
  void openDocument(url);
}
