/**
 * Aperçu d'un document de la docuthèque.
 *
 * Deux types seulement sont réellement prévisualisables dans un navigateur sans
 * dépendance externe : les images (<img>) et les PDF (<iframe>, via le viewer
 * natif du navigateur). Tout le reste retombe sur l'ouverture externe.
 *
 * En WebView native, l'iframe PDF n'est pas fiable (Android n'a pas de viewer
 * PDF embarqué) : on n'y propose l'aperçu que pour les images.
 */
import { useTranslation } from "react-i18next";
import { Download, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { documentKind, formatFileSize, type WallDocument } from "@/lib/wall/documents";
import { documentDownloadUrl } from "@/lib/wall/download-url";
import { downloadDocument, openDocument } from "@/lib/open-document";
import { isNativePlatform } from "@/lib/native-platform";

/** True si le document peut être affiché en place plutôt qu'ouvert ailleurs. */
export function isPreviewable(doc: Pick<WallDocument, "type" | "name">): boolean {
  const kind = documentKind(doc.type, doc.name);
  if (kind === "image") return true;
  return kind === "pdf" && !isNativePlatform();
}

export function WallDocumentPreview({
  doc,
  onOpenChange,
}: {
  doc: WallDocument | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const kind = doc ? documentKind(doc.type, doc.name) : "other";
  const size = doc ? formatFileSize(doc.size) : "";

  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col gap-3">
        <DialogHeader className="text-left">
          <DialogTitle className="truncate pr-8">{doc?.label ?? doc?.name}</DialogTitle>
          <DialogDescription className="truncate">
            {[doc?.label ? doc?.name : null, size].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[45vh] overflow-auto rounded-xl bg-muted/40 flex items-center justify-center">
          {doc && kind === "image" && (
            <img
              src={doc.url}
              alt={doc.label ?? doc.name}
              className="max-h-[62vh] w-auto object-contain"
              loading="lazy"
            />
          )}
          {doc && kind === "pdf" && (
            <iframe
              src={doc.url}
              title={doc.label ?? doc.name}
              className="h-[62vh] w-full rounded-xl border-0 bg-background"
            />
          )}
          {doc && kind !== "image" && kind !== "pdf" && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {t("wall.documents.noPreview", {
                defaultValue: "Aperçu indisponible pour ce type de fichier.",
              })}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => doc && void openDocument(doc.url)}>
            <ExternalLink className="h-4 w-4" />
            {t("wall.documents.openExternal", { defaultValue: "Ouvrir" })}
          </Button>
          {/* `download` est ignoré en cross-origin (le fichier vient du bucket
              Supabase) : le navigateur ouvrait l'onglet au lieu de télécharger.
              C'est `?download=` qui fait renvoyer un Content-Disposition par
              Supabase. Et le téléchargement passe par `downloadDocument`, qui
              n'ouvre aucune popup et reste fonctionnel en WebView Android. */}
          <Button
            size="sm"
            disabled={!doc}
            onClick={() => doc && void downloadDocument(documentDownloadUrl(doc))}
          >
            <Download className="h-4 w-4" />
            {t("wall.documents.download", { defaultValue: "Télécharger" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
