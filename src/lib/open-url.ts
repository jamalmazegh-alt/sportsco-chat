/**
 * Ouverture d'une URL externe, web et natif.
 *
 * Une WebView n'a pas d'onglets : `window.open(url, "_blank")` y est avalé sans
 * rien afficher ni lever d'erreur. Tous les liens sortants — portail Stripe,
 * facture PDF, page publique d'un tournoi, lien de parrainage — sont donc morts
 * dans l'app native tant qu'ils passent par ce motif.
 *
 * Import STATIQUE du plugin, à dessein : l'import dynamique ne se résout jamais
 * dans la WKWebView (promesse pendante, ni valeur ni rejet — même piège que
 * `native-push.ts`). Le bundle web n'embarque que quelques Ko de proxy inerte,
 * jamais invoqué grâce à la garde `isNativePlatform()`.
 */
import { Browser } from "@capacitor/browser";
import { isNativePlatform } from "@/lib/native-platform";

/** `mailto:`, `tel:`, `sms:`, `whatsapp:`… tout ce qui n'est pas une page web. */
function isAppScheme(url: string): boolean {
  return /^(?!https?:)[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * Ouvre une URL hors de l'application.
 *
 * En natif, les pages web s'affichent dans un Chrome Custom Tab (Android) ou un
 * SFSafariViewController (iOS) : l'utilisateur garde la barre d'adresse, le
 * bouton de partage et le retour vers l'app. Les schémas applicatifs
 * (`mailto:`, `tel:`…) passent par une navigation que Capacitor intercepte pour
 * la confier au système.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  if (!isNativePlatform()) {
    // Pas de chaîne de « window features » : elle forcerait une popup, souvent
    // bloquée silencieusement, au lieu d'un véritable onglet.
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  // Capacitor confie les schémas non-http au système (Intent / openURL) ;
  // `Browser.open` ne saurait qu'en faire.
  if (isAppScheme(url)) {
    window.location.href = url;
    return;
  }

  try {
    await Browser.open({ url });
  } catch (e) {
    // Un échec du bridge ne doit pas laisser un clic mort : la navigation
    // WebView vaut mieux que rien.
    console.warn("[open-url] Browser.open failed:", (e as Error).message);
    window.location.href = url;
  }
}

/**
 * Ouvre une URL en laissant le système choisir l'application cible.
 *
 * À réserver aux liens qu'une app installée sait mieux traiter qu'un navigateur
 * — `wa.me` vers WhatsApp, notamment. Un Custom Tab garderait la page dans un
 * navigateur embarqué, où les liens d'application ne se déclenchent pas.
 */
export function openInSystemApp(url: string): void {
  if (!url) return;
  if (!isNativePlatform()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = url;
}

/**
 * Handler de clic pour un `<a target="_blank">` : conserve les sémantiques web
 * (clic milieu, « ouvrir dans un nouvel onglet », copie du lien) et ne dévie
 * vers le navigateur natif que sur mobile.
 */
export function handleExternalLinkClick(e: React.MouseEvent, url: string): void {
  if (!isNativePlatform()) return;
  e.preventDefault();
  void openExternalUrl(url);
}
