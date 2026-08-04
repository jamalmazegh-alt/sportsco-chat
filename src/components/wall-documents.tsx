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
  EyeOff,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WallFeedSkeleton } from "@/components/skeletons";
import { downloadDocument, handleDocumentClick, openDocument } from "@/lib/open-document";
import { documentDownloadUrl } from "@/lib/wall/download-url";
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
  const [showExcluded, setShowExcluded] = useState(false);

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

  /**
   * Retire (ou remet) un document de la docuthèque. La publication d'origine
   * n'est jamais modifiée : c'est du rangement, réversible, pas une
   * suppression. Le retrait n'est donc PAS un moyen de rendre un fichier
   * inaccessible — il reste ouvrable depuis son post.
   */
  const setExcluded = useCallback(
    async (doc: WallDocument, excluded: boolean) => {
      const { error } = await supabase.rpc("set_wall_document_excluded", {
        _post_id: doc.postId,
        _path: doc.path,
        _excluded: excluded,
      });
      if (error) {
        // Un « l'opération a échoué » nu est indébogable — c'est ce qui a rendu
        // laborieux le diagnostic de la migration non appliquée en production.
        // PGRST202 = fonction introuvable côté PostgREST.
        console.warn(
          "[wall-documents] set_wall_document_excluded failed:",
          error.code,
          error.message,
        );
        throw error;
      }
      setDocs((prev) => {
        // Quand l'encadrement n'a pas demandé à voir les documents retirés, le
        // document doit DISPARAÎTRE de la liste : le laisser affiché avec un
        // badge « Retiré » donne l'impression que l'action n'a rien fait.
        if (excluded && !showExcluded) return prev.filter((d) => d.key !== doc.key);
        // Remise en ligne : la ligne ayant été retirée de la liste juste avant,
        // un `map` ne retrouve rien et l'annulation du toast restait sans effet
        // visible. On la réinsère à sa place chronologique.
        if (!excluded && !prev.some((d) => d.key === doc.key)) {
          const restored = { ...doc, excludedFromLibrary: false };
          const at = prev.findIndex((d) => d.createdAt < restored.createdAt);
          return at === -1
            ? [...prev, restored]
            : [...prev.slice(0, at), restored, ...prev.slice(at)];
        }
        return prev.map((d) => (d.key === doc.key ? { ...d, excludedFromLibrary: excluded } : d));
      });
    },
    [showExcluded],
  );

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
      return {
        // Les documents retirés ne sont chargés que pour l'encadrement, et
        // seulement quand il demande à les voir : sinon un retrait serait
        // définitif faute de pouvoir le défaire.
        docs: flattenDocuments(rows, { includeExcluded: canManageAll && showExcluded }),
        full: rows.length === PAGE_SIZE,
        failed: false,
      };
    },
    [clubId, staffTeamId, canSeeHidden, canManageAll, showExcluded],
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
      <p className="text-sm text-destructive text-center py-10">{t("wall.documents.loadError")}</p>
    );
  }

  const excludedToggle = canManageAll ? (
    <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded border-border"
        checked={showExcluded}
        onChange={(e) => setShowExcluded(e.target.checked)}
      />
      {t("wall.documents.showExcluded")}
    </label>
  ) : null;

  if (!docs.length) {
    return (
      <div className="space-y-4">
        {excludedToggle}
        <p className="text-sm text-muted-foreground text-center py-10">
          {t("wall.documents.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {excludedToggle}
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
                canManage={canManageAll || (!!user?.id && doc.authorUserId === user.id)}
                onRename={renameDoc}
                onSetExcluded={setExcluded}
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
              t("wall.documents.loadMore")
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
  canManage,
  onRename,
  onSetExcluded,
}: {
  doc: WallDocument;
  authorName?: string;
  dateLocale: Locale;
  onOpenPost: (postId: string) => void;
  /** Renommer et retirer/remettre — mêmes droits, ceux de la RPC. */
  canManage: boolean;
  onRename: (doc: WallDocument, label: string) => Promise<void>;
  onSetExcluded: (doc: WallDocument, excluded: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.label ?? doc.name);
  const [saving, setSaving] = useState(false);
  const [busyExcluding, setBusyExcluding] = useState(false);
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
      toast.error(t("wall.documents.renameError"));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Retirer est réversible : pas de modale de confirmation, mais une annulation
   * immédiate dans le toast — même geste que la suppression d'une publication
   * sur le mur (`wall-feed.tsx`).
   */
  async function toggleExcluded(excluded: boolean) {
    setBusyExcluding(true);
    try {
      await onSetExcluded(doc, excluded);
      if (excluded) {
        toast.success(t("wall.documents.excluded"), {
          action: {
            label: t("common.undo"),
            onClick: () => {
              void onSetExcluded(doc, false).catch(() =>
                toast.error(t("wall.documents.excludeError")),
              );
            },
          },
        });
      } else {
        toast.success(t("wall.documents.restored"));
      }
    } catch (e) {
      // « Réessayez » est un mauvais conseil quand la fonction n'existe pas en
      // base : réessayer échouera toujours. On distingue ce cas — celui-là même
      // qui s'est produit en production — plutôt que d'envoyer l'utilisateur
      // vers un bouton qui ne marchera jamais.
      const code = (e as { code?: string })?.code;
      toast.error(
        code === "PGRST202"
          ? t("wall.documents.excludeUnavailable")
          : t("wall.documents.excludeError"),
      );
    } finally {
      setBusyExcluding(false);
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
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.save")}
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
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(doc.label ?? doc.name);
                    setEditing(true);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={t("wall.documents.rename")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={busyExcluding}
                  onClick={() => void toggleExcluded(!doc.excludedFromLibrary)}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  aria-label={
                    doc.excludedFromLibrary
                      ? t("wall.documents.restore")
                      : t("wall.documents.exclude")
                  }
                >
                  {doc.excludedFromLibrary ? (
                    <Undo2 className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
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
            aria-label={t("wall.documents.preview")}
          >
            <img src={doc.url} alt="" loading="lazy" className="h-24 w-24 object-cover" />
          </button>
        )}

        <div className="flex items-center gap-2">
          {doc.hidden && (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
              {t("wall.moderation.hiddenBadgeShort")}
            </span>
          )}
          {doc.excludedFromLibrary && (
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {t("wall.documents.excludedBadge")}
            </span>
          )}
          {previewable && (
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="text-[11px] text-primary hover:underline"
            >
              {t("wall.documents.preview")}
            </button>
          )}
          {/* Téléchargement direct depuis la liste : `?download=` fait renvoyer
              un Content-Disposition par le stockage (l'attribut HTML `download`
              est ignoré en cross-origin), et `downloadDocument` évite la popup
              bloquée / le clic mort en WebView. */}
          <button
            type="button"
            onClick={() => void downloadDocument(documentDownloadUrl(doc), doc.name)}
            className="text-[11px] text-primary hover:underline"
          >
            {t("wall.documents.download")}
          </button>

          <button
            type="button"
            onClick={() => onOpenPost(doc.postId)}
            className="text-[11px] text-primary hover:underline"
          >
            {t("wall.documents.viewPost")}
          </button>
        </div>
      </div>

      <WallDocumentPreview doc={preview ? doc : null} onOpenChange={(o) => setPreview(o)} />
    </li>
  );
}
