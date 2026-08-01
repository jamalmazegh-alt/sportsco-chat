import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileText, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ATTACHMENT_LABEL_MAX } from "@/lib/wall/documents";

export type Attachment = {
  url: string;
  path: string;
  name: string;
  type: string;
  size: number;
  // Nom donné par l'auteur ("Programme de reprise"), saisi uniquement sur le mur
  // (voir `requireLabel`). Optionnel : les pièces jointes publiées avant la
  // docuthèque n'en ont pas, et les autres AttachmentPicker ne le demandent pas.
  label?: string;
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Allowlist strict côté client. Le bucket reste public mais on filtre les MIME
// pour éviter qu'un utilisateur ne dépose des exécutables, scripts ou HTML
// (vecteur XSS sur les liens publics).
const ALLOWED_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

function isMimeAllowed(file: File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  // Fallback: certains navigateurs ne renseignent pas file.type pour .heic/.csv.
  // On valide alors par extension.
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return false;
  return [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "heic",
    "heif",
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "txt",
    "csv",
  ].includes(ext);
}

export function AttachmentPicker({
  value,
  onChange,
  prefix,
  accept = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt",
  max = 4,
  requireLabel = false,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  prefix: string;
  accept?: string;
  max?: number;
  /**
   * Demande un nom pour chaque fichier (docuthèque du mur). Opt-in : les autres
   * usages du picker (chat d'événement, tournois, fiche événement) ne doivent
   * pas se voir imposer une saisie supplémentaire.
   */
  requireLabel?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files || !user) return;
    setBusy(true);
    const next = [...value];
    for (const file of Array.from(files)) {
      if (next.length >= max) break;
      if (file.size > MAX_BYTES) {
        toast.error(t("attachments.tooLarge", { name: file.name }));
        continue;
      }
      if (!isMimeAllowed(file)) {
        toast.error(
          t("attachments.invalidType", {
            name: file.name,
            defaultValue: `Type de fichier non autorisé : ${file.name}`,
          }),
        );
        continue;
      }
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${prefix}/${Date.now()}-${safe}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) {
        toast.error(error.message);
        continue;
      }
      const { data } = supabase.storage.from("attachments").getPublicUrl(path);
      next.push({
        url: data.publicUrl,
        path,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      });
    }
    onChange(next);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(att: Attachment) {
    await supabase.storage.from("attachments").remove([att.path]);
    onChange(value.filter((a) => a.path !== att.path));
  }

  function setLabel(att: Attachment, label: string) {
    onChange(
      value.map((a) =>
        a.path === att.path ? { ...a, label: label.slice(0, ATTACHMENT_LABEL_MAX) } : a,
      ),
    );
  }

  return (
    <div className="space-y-2">
      {value.length > 0 &&
        (requireLabel ? (
          <NamedAttachmentList items={value} onRemove={remove} onLabelChange={setLabel} />
        ) : (
          <AttachmentList items={value} onRemove={remove} />
        ))}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy || value.length >= max}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          <span className="ml-1.5">{t("attachments.add")}</span>
        </Button>
      </div>
    </div>
  );
}

export function AttachmentList({
  items,
  onRemove,
  className,
}: {
  items: Attachment[];
  onRemove?: (a: Attachment) => void;
  className?: string;
}) {
  if (!items?.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {items.map((a) => {
        const isImage = a.type?.startsWith("image/");
        const label = a.label?.trim();
        return (
          <li key={a.path} className="relative group">
            {isImage ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="block w-24">
                <img
                  src={a.url}
                  alt={label || a.name}
                  className="h-24 w-24 rounded-lg object-cover border border-border"
                />
                {label && (
                  <span className="block mt-1 text-[11px] leading-tight truncate" title={a.name}>
                    {label}
                  </span>
                )}
              </a>
            ) : (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 max-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-muted/50"
              >
                <FileText className="h-4 w-4 text-primary shrink-0" />
                {/* Nom donné par l'auteur en principal, nom de fichier accolé en secondaire. */}
                <span className="truncate flex-1">
                  {label ? (
                    <>
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground"> · {a.name}</span>
                    </>
                  ) : (
                    a.name
                  )}
                </span>
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(a)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                aria-label="remove"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Variante du picker où chaque fichier doit être nommé avant publication.
 * Réservée au mur (club + staff) : voir `AttachmentPicker.requireLabel`.
 */
function NamedAttachmentList({
  items,
  onRemove,
  onLabelChange,
}: {
  items: Attachment[];
  onRemove: (a: Attachment) => void;
  onLabelChange: (a: Attachment, label: string) => void;
}) {
  const { t } = useTranslation();
  if (!items?.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((a) => {
        const isImage = a.type?.startsWith("image/");
        const missing = !a.label?.trim();
        return (
          <li
            key={a.path}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2"
          >
            {isImage ? (
              <img
                src={a.url}
                alt={a.name}
                className="h-10 w-10 rounded object-cover border border-border shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded bg-primary/8 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <input
                type="text"
                value={a.label ?? ""}
                onChange={(e) => onLabelChange(a, e.target.value)}
                maxLength={ATTACHMENT_LABEL_MAX}
                aria-label={t("attachments.documentName", { defaultValue: "Nom du document" })}
                placeholder={t("attachments.documentNamePlaceholder", {
                  defaultValue: "Nom du document (ex. Programme de reprise)",
                })}
                className={cn(
                  "w-full rounded-md border bg-background px-2 py-1.5 text-sm",
                  missing ? "border-destructive/60" : "border-border",
                )}
              />
              <p className="text-[11px] text-muted-foreground truncate">{a.name}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(a)}
              className="h-6 w-6 rounded-full bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center shrink-0"
              aria-label={t("attachments.remove", { defaultValue: "Retirer" })}
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
