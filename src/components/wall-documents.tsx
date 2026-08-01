import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, type Locale } from "date-fns";
import { fr, enUS, es, de, it, nl, pt } from "date-fns/locale";
import {
  FileText,
  FileSpreadsheet,
  FileType,
  ImageIcon,
  File,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WallFeedSkeleton } from "@/components/skeletons";
import { handleDocumentClick } from "@/lib/open-document";
import { WallDocumentPreview, isPreviewable } from "@/components/wall-document-preview";

import {
  flattenDocuments,
  groupDocumentsByMonth,
  documentKind,
  formatFileSize,
  type DocumentPost,
  type WallDocument,
  type DocumentKind,
} from "@/lib/wall/documents";

const PAGE_SIZE = 50;

const DATE_LOCALES: Record<string, Locale> = { fr, en: enUS, es, de, it, nl, pt };

const KIND_ICONS: Record<DocumentKind, typeof FileText> = {
  image: ImageIcon,
  pdf: FileType,
  doc: FileText,
  sheet: FileSpreadsheet,
  other: File,
};

type Profile = { id: string; full_name: string | null };

/**
 * Onglet « Documents » du mur : liste les pièces jointes des publications
 * visibles par l'utilisateur, groupées par mois.
 *
 * La sécurité repose entièrement sur la RLS `wall_posts_select` — on ne filtre
 * ici que ce que le feed filtre déjà (supprimé / masqué / staff d'équipe).
 */
export function WallDocuments({
  clubId,
  staffTeamId,
  onOpenPost,
}: {
  clubId: string;
  staffTeamId?: string;
  onOpenPost: (postId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const roles = useMyRoles();
  const { user } = useAuth();
  const [docs, setDocs] = useState<WallDocument[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const dateLocale = DATE_LOCALES[i18n.language?.split("-")[0] ?? "fr"] ?? fr;
  // Même règle que le feed : seuls admins/dirigeants voient les posts masqués
  // par la modération, avec un badge explicite.
  const canSeeHidden = roles.includes("admin") || roles.includes("dirigeant");
  // Renommer : l'auteur du post, ou l'encadrement du club (mêmes droits que
  // la RPC `rename_wall_document`, qui reste la source de vérité).
  const canManageAll = roles.includes("admin") || roles.includes("dirigeant");

  const renameDoc = useCallback(async (doc: WallDocument, label: string) => {
    const { error } = await supabase.rpc("rename_wall_document", {
      _post_id: doc.postId,
      _path: doc.path,
      _label: label,
    });
    if (error) throw error;
    setDocs((prev) => prev.map((d) => (d.key === doc.key ? { ...d, label } : d)));
  }, []);

  const deleteDoc = useCallback(async (doc: WallDocument) => {
    const { error } = await supabase.rpc("delete_wall_document", {
      _post_id: doc.postId,
      _path: doc.path,
    });
    if (error) throw error;
    setDocs((prev) => prev.filter((d) => d.key !== doc.key));
  }, []);

  const load = useCallback(
    async (pageIndex: number) => {
      let query = supabase
        .from("wall_posts")
        .select("id, created_at, author_user_id, attachments, hidden_at, source")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        // Les posts relayés des réseaux sociaux n'ont pas de pièce jointe interne.
        .eq("source", "clubero")
        // `jsonb_array_length(...) > 0` n'est pas exprimable via PostgREST : on
        // écarte au moins le tableau vide, le reste est filtré à l'aplatissement.
        .not("attachments", "eq", "[]");
      if (!canSeeHidden) query = query.is("hidden_at", null);
      if (staffTeamId) {
        query = query
          .eq("audience_type", "team_staff")
          .contains("audience_team_ids", [staffTeamId]);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1);
      // Sans ce drapeau, une requête en échec afficherait « aucun document »,
      // indiscernable d'une docuthèque réellement vide.
      if (error) return { docs: [] as WallDocument[], full: false, failed: true };
      const rows = (data ?? []) as DocumentPost[];
      return { docs: flattenDocuments(rows), full: rows.length === PAGE_SIZE, failed: false };
    },
    [clubId, staffTeamId, canSeeHidden],
  );

  // Les noms d'auteurs ne sont pas joignables en une requête (profiles est une
  // table séparée) : on les résout par lot, comme le feed.
  const resolveAuthors = useCallback(async (list: WallDocument[]) => {
    const ids = Array.from(
      new Set(list.map((d) => d.authorUserId).filter((x): x is string => !!x)),
    );
    if (!ids.length) return;
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    setAuthors((prev) => {
      const next = { ...prev };
      for (const p of (data ?? []) as Profile[]) next[p.id] = p.full_name ?? "";
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(0);
    load(0).then(({ docs: first, full, failed: err }) => {
      if (cancelled) return;
      setDocs(first);
      setHasMore(full);
      setFailed(err);
      setLoading(false);
      void resolveAuthors(first);
    });
    return () => {
      cancelled = true;
    };
  }, [load, resolveAuthors]);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    const { docs: more, full, failed: err } = await load(nextPage);
    setDocs((prev) => [...prev, ...more]);
    setPage(nextPage);
    setHasMore(full);
    setFailed(err);
    setLoadingMore(false);
    void resolveAuthors(more);
  }

  const groups = useMemo(() => groupDocumentsByMonth(docs), [docs]);

  if (loading) return <WallFeedSkeleton />;

  if (failed && !docs.length) {
    return (
      <p className="text-sm text-destructive text-center py-10">
        {t("wall.documents.loadError", {
          defaultValue: "Les documents n'ont pas pu être chargés. Réessayez dans un instant.",
        })}
      </p>
    );
  }

  if (!docs.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        {t("wall.documents.empty", {
          defaultValue:
            "Aucun document pour l'instant. Les fichiers joints aux publications du mur apparaîtront ici.",
        })}
      </p>
    );
  }

  return (
    <div className="space-y-7">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sticky top-0 bg-background/80 backdrop-blur py-1 -mx-5 px-5">
            {format(group.date, "MMMM yyyy", { locale: dateLocale })}
          </h2>
          <ul className="space-y-2.5">
            {group.items.map((doc) => (
              <DocumentRow
                key={doc.key}
                doc={doc}
                authorName={doc.authorUserId ? authors[doc.authorUserId] : undefined}
                dateLocale={dateLocale}
                onOpenPost={onOpenPost}
                canRename={canManageAll || (!!user?.id && doc.authorUserId === user.id)}
                onRename={renameDoc}
                onDelete={deleteDoc}
              />
            ))}
          </ul>
        </section>
      ))}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("wall.documents.loadMore", { defaultValue: "Voir plus" })
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  authorName,
  dateLocale,
  onOpenPost,
  canRename,
  onRename,
  onDelete,
}: {
  doc: WallDocument;
  authorName?: string;
  dateLocale: Locale;
  onOpenPost: (postId: string) => void;
  canRename: boolean;
  onRename: (doc: WallDocument, label: string) => Promise<void>;
  onDelete: (doc: WallDocument) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.label ?? doc.name);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const d = new Date(doc.createdAt);
  const kind = documentKind(doc.type, doc.name);
  const Icon = KIND_ICONS[kind];
  const size = formatFileSize(doc.size);
  const meta = [doc.label ? doc.name : null, size, authorName].filter(Boolean).join(" · ");
  const previewable = isPreviewable(doc);

  async function save() {
    const label = draft.trim();
    if (!label || label === (doc.label ?? doc.name)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(doc, label);
      setEditing(false);
    } catch {
      toast.error(
        t("wall.documents.renameError", { defaultValue: "Le renommage a échoué. Réessayez." }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await onDelete(doc);
      toast.success(t("wall.documents.deleted", { defaultValue: "Document supprimé" }));
      setConfirmDelete(false);
    } catch {
      toast.error(
        t("wall.documents.deleteError", { defaultValue: "La suppression a échoué. Réessayez." }),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex items-stretch gap-3 rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/40">
      {/* Bloc date à gauche, comme la page Événements. */}
      <div className="flex flex-col items-center justify-center w-16 shrink-0 py-3 bg-primary/8">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          {format(d, "EEE", { locale: dateLocale })}
        </span>
        <span className="text-2xl font-bold leading-none mt-0.5">{format(d, "d")}</span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground mt-1" />
      </div>
      <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-center gap-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={draft}
              maxLength={80}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") {
                  setDraft(doc.label ?? doc.name);
                  setEditing(false);
                }
              }}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("common.save", { defaultValue: "Enregistrer" })
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Lien réel sur le web (nouvel onglet, copie du lien) ; dévié vers
                l'aperçu quand le type s'y prête, ou vers le navigateur natif en
                WebView, où `target="_blank"` est inerte. */}
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (previewable && !e.metaKey && !e.ctrlKey && e.button === 0) {
                  e.preventDefault();
                  setPreview(true);
                  return;
                }
                handleDocumentClick(e, doc.url);
              }}
              className="text-sm font-medium truncate hover:underline"
            >
              {doc.label ?? doc.name}
            </a>
            {canRename && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(doc.label ?? doc.name);
                    setEditing(true);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={t("wall.documents.rename", { defaultValue: "Renommer" })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t("wall.documents.delete", { defaultValue: "Supprimer" })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
        {meta && <p className="text-[11px] text-muted-foreground truncate">{meta}</p>}

        {/* Vignette dans le corps de la carte, comme les pièces jointes du mur. */}
        {kind === "image" && (
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="mt-1 w-24 shrink-0 rounded-lg overflow-hidden border border-border"
            aria-label={t("wall.documents.preview", { defaultValue: "Aperçu" })}
          >
            <img src={doc.url} alt="" loading="lazy" className="h-24 w-24 object-cover" />
          </button>
        )}

        <div className="flex items-center gap-2">
          {doc.hidden && (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
              {t("wall.moderation.hiddenBadgeShort", { defaultValue: "Masqué" })}
            </span>
          )}
          {previewable && (
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="text-[11px] text-primary hover:underline"
            >
              {t("wall.documents.preview", { defaultValue: "Aperçu" })}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenPost(doc.postId)}
            className="text-[11px] text-primary hover:underline"
          >
            {t("wall.documents.viewPost", { defaultValue: "Voir la publication" })}
          </button>
        </div>
      </div>

      <WallDocumentPreview doc={preview ? doc : null} onOpenChange={(o) => setPreview(o)} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("wall.documents.deleteTitle", { defaultValue: "Supprimer ce document ?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("wall.documents.deleteDescription", {
                defaultValue:
                  "Le fichier sera retiré de la docuthèque et de la publication. Cette action est définitive.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel", { defaultValue: "Annuler" })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("wall.documents.delete", { defaultValue: "Supprimer" })
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
