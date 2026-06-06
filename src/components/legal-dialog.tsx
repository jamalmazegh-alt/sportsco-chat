import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getLegalDoc } from "@/lib/legal.functions";

type LegalKind =
  | "terms"
  | "privacy"
  | "data_processing"
  | "media"
  | "notifications"
  | "legal_notice"
  | "parental_consent";

function inline(text: string) {
  const parts: Array<string | ReactNode> = [];
  const regex = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    if (m[2])
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {m[2]}
        </strong>,
      );
    else if (m[3] && m[4])
      parts.push(
        <a
          key={key++}
          href={m[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {m[3]}
        </a>,
      );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((p, i) =>
    typeof p === "string" ? <span key={i}>{p}</span> : p,
  );
}

function renderMarkdown(md: string) {
  const blocks = md.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("### "))
      return (
        <h3 key={i} className="mt-5 font-semibold text-base">
          {inline(trimmed.slice(4))}
        </h3>
      );
    if (trimmed.startsWith("## "))
      return (
        <h2 key={i} className="mt-6 font-bold text-lg">
          {inline(trimmed.slice(3))}
        </h2>
      );
    if (trimmed.startsWith("# "))
      return (
        <h2 key={i} className="mt-6 font-bold text-xl">
          {inline(trimmed.slice(2))}
        </h2>
      );
    if (/^([-*]|\d+\.)\s/.test(trimmed)) {
      const ordered = /^\d+\./.test(trimmed);
      const items = trimmed
        .split(/\n/)
        .map((l) => l.replace(/^([-*]|\d+\.)\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      return (
        <Tag
          key={i}
          className={`mt-2 ${ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5 text-sm text-foreground/80`}
        >
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </Tag>
      );
    }
    return (
      <p key={i} className="mt-2 text-sm leading-relaxed text-foreground/80">
        {inline(trimmed)}
      </p>
    );
  });
}

export function LegalDialog({
  open,
  onOpenChange,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: LegalKind | null;
}) {
  const { i18n } = useTranslation();
  const [doc, setDoc] = useState<{
    title: string;
    content_md: string;
    version: number;
    published_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !kind) return;
    setLoading(true);
    setDoc(null);
    getLegalDoc({ data: { kind, locale: i18n.language?.slice(0, 2) ?? "fr" } })
      .then((d) => setDoc(d as any))
      .finally(() => setLoading(false));
  }, [open, kind, i18n.language]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{doc?.title ?? "…"}</DialogTitle>
          {doc && (
            <DialogDescription>
              v{doc.version} ·{" "}
              {new Date(doc.published_at).toLocaleDateString(
                i18n.language?.startsWith("fr") ? "fr-FR" : "en-US",
              )}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {doc && <div className="space-y-1">{renderMarkdown(doc.content_md)}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
