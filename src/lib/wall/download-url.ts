import { supabase } from "@/integrations/supabase/client";

/**
 * URL qui force le téléchargement d'une pièce jointe plutôt que son affichage.
 *
 * L'attribut HTML `download` est **ignoré en cross-origin** : les fichiers
 * venant du bucket Supabase, un `<a download>` ouvrait simplement un onglet.
 * C'est le paramètre `?download=` qui fait renvoyer un
 * `Content-Disposition: attachment` par Supabase.
 *
 * Repli sur l'URL brute quand le chemin est absent (pièce jointe historique au
 * format inattendu) : mieux vaut ouvrir le fichier que ne rien faire.
 */
export function documentDownloadUrl(doc: { path: string; name: string; url: string }): string {
  if (!doc.path) return doc.url;
  const { data } = supabase.storage.from("attachments").getPublicUrl(doc.path, {
    download: doc.name || true,
  });
  return data?.publicUrl || doc.url;
}
