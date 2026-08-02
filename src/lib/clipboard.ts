/**
 * Copie dans le presse-papiers, web et natif.
 *
 * `navigator.clipboard` n'existe que dans un contexte sécurisé. En natif iOS,
 * l'origine est `capacitor://localhost`, un schéma personnalisé que la WKWebView
 * ne traite pas comme tel : l'API est absente. Les appels écrits
 * `navigator.clipboard?.writeText(...)` n'y font donc rien, en silence, et
 * l'application affiche pourtant « Lien copié ».
 *
 * Import STATIQUE du plugin, à dessein : l'import dynamique ne se résout jamais
 * dans la WKWebView (promesse pendante, ni valeur ni rejet — même piège que
 * `native-push.ts`). Le bundle web n'embarque que quelques Ko de proxy inerte,
 * jamais invoqué grâce à la garde `isNativePlatform()`.
 */
import { Clipboard } from "@capacitor/clipboard";
import { isNativePlatform } from "@/lib/native-platform";

/**
 * Copie un texte. Renvoie `false` si la copie a échoué, pour que l'appelant
 * puisse afficher un échec plutôt qu'un faux succès.
 */
export async function copyText(text: string): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      await Clipboard.write({ string: text });
      return true;
    } catch (e) {
      console.warn("[clipboard] Clipboard.write failed:", (e as Error).message);
      return false;
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refus de permission ou contexte non sécurisé : on tente le repli.
  }

  // Repli historique, seul recours en http ou dans les navigateurs anciens.
  // `execCommand` est déprécié mais reste implémenté partout.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Hors écran plutôt que `display:none` : un champ masqué n'est pas
    // sélectionnable, et la sélection est ce qui déclenche la copie.
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) {
    console.warn("[clipboard] fallback failed:", (e as Error).message);
    return false;
  }
}
