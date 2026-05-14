import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileText, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type Attachment = {
  url: string;
  path: string;
  name: string;
  type: string;
  size: number;
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function AttachmentPicker({
  value,
  onChange,
  prefix,
  accept = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt",
  max = 4,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  prefix: string;
  accept?: string;
  max?: number;
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

  return (
    <div className="space-y-2">
      {value.length > 0 && <AttachmentList items={value} onRemove={remove} />}
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
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
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
        return (
          <li key={a.path} className="relative group">
            {isImage ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-24 w-24 rounded-lg object-cover border border-border"
                />
              </a>
            ) : (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 max-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-muted/50"
              >
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate flex-1">{a.name}</span>
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
