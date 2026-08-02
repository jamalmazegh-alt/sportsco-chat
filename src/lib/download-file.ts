import { isNativePlatform } from "@/lib/native-platform";

/**
 * Téléchargement de fichier, web et natif.
 *
 * Le motif habituel — créer un `<a download>` sur une URL blob et le cliquer —
 * **ne fonctionne pas dans une WebView** : l'attribut `download` y est ignoré,
 * le clic ne produit rien et l'utilisateur ne voit aucune erreur. Constaté sur
 * appareil réel en tentant de télécharger une feuille de match.
 *
 * En natif, on écrit donc le fichier dans le répertoire cache de l'app, puis on
 * ouvre la feuille de partage du système : l'utilisateur peut l'ouvrir dans un
 * lecteur, l'enregistrer ou l'envoyer. C'est le comportement attendu sur mobile,
 * où il n'existe pas de « dossier Téléchargements » manipulable comme sur
 * ordinateur.
 *
 * Les plugins sont importés dynamiquement et uniquement en natif : le bundle
 * web n'en embarque rien.
 */

/** Convertit un Blob en base64 sans préfixe de type MIME. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  // Par tranches : `String.fromCharCode(...buf)` dépasse la taille de pile
  // sur un fichier de quelques centaines de kilo-octets.
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * Propose un fichier à l'utilisateur.
 *
 * @param blob     contenu du fichier
 * @param filename nom proposé, extension comprise
 * @param title    titre de la feuille de partage en natif (optionnel)
 */
export async function downloadFile(blob: Blob, filename: string, title?: string): Promise<void> {
  if (!isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Laisser au navigateur le temps d'amorcer le téléchargement avant de
    // révoquer l'URL, sans quoi Safari annule silencieusement.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  const data = await blobToBase64(blob);
  // Cache plutôt que Documents : ces fichiers sont des exports ponctuels, pas
  // des données à conserver, et le système peut les purger librement.
  const written = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
  });

  await Share.share({
    title: title ?? filename,
    files: [written.uri],
  });
}

/** Variante pour les contenus déjà encodés en base64 (PDF générés côté serveur). */
export async function downloadBase64(
  base64: string,
  filename: string,
  mimeType: string,
  title?: string,
): Promise<void> {
  const bin = atob(base64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  await downloadFile(new Blob([buf], { type: mimeType }), filename, title);
}
