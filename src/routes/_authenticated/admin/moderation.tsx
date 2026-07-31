import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Flag, Eye, EyeOff, Trash2, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/date-locale";
import { listWallReports, resolveWallReport } from "@/lib/wall/moderation.functions";

export const Route = createFileRoute("/_authenticated/admin/moderation")({
  component: ModerationPage,
  head: () => ({
    meta: [
      { title: "Modération du mur — Clubero" },
      {
        name: "description",
        content: "Traitez les signalements de messages et commentaires du mur de votre club.",
      },
      { property: "og:title", content: "Modération du mur — Clubero" },
      {
        property: "og:description",
        content: "Traitez les signalements de messages et commentaires du mur de votre club.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Page introuvable</div>,
});

const REASONS: Record<string, string> = {
  inappropriate: "Contenu inapproprié",
  harassment: "Harcèlement",
  spam: "Spam",
  misinformation: "Information erronée",
  privacy: "Vie privée",
  other: "Autre",
};

type StatusFilter = "pending" | "reviewing" | "dismissed" | "actioned" | "all";

function ModerationPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listWallReports);
  const resolve = useServerFn(resolveWallReport);
  const [status, setStatus] = useState<StatusFilter>("pending");

  const { data, isLoading } = useQuery({
    queryKey: ["wall-reports", activeClubId, status],
    enabled: !!activeClubId,
    queryFn: async () => (await list({ data: { clubId: activeClubId as string, status } })) as
      | { reports: Report[] }
      | undefined,
  });

  const mutation = useMutation({
    mutationFn: async (vars: { reportId: string; action: string }) =>
      resolve({ data: vars as never }),
    onSuccess: () => {
      toast.success(t("wall.moderation.done", { defaultValue: "Signalement traité" }));
      qc.invalidateQueries({ queryKey: ["wall-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reports = useMemo(() => data?.reports ?? [], [data]);

  const filters: Array<{ key: StatusFilter; label: string }> = [
    { key: "pending", label: t("wall.moderation.pending", { defaultValue: "En attente" }) },
    { key: "reviewing", label: t("wall.moderation.reviewing", { defaultValue: "En cours" }) },
    { key: "actioned", label: t("wall.moderation.actioned", { defaultValue: "Traités" }) },
    { key: "dismissed", label: t("wall.moderation.dismissed", { defaultValue: "Ignorés" }) },
    { key: "all", label: t("common.all", { defaultValue: "Tous" }) },
  ];

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Flag className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">
          {t("wall.moderation.title", { defaultValue: "Modération du mur" })}
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("wall.moderation.hint", {
          defaultValue:
            "Les contenus signalés restent visibles tant qu'un responsable ne les masque pas ou ne les supprime pas.",
        })}
      </p>

      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              status === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={t("wall.moderation.empty", { defaultValue: "Aucun signalement" })}
          description={t("wall.moderation.emptyHint", {
            defaultValue: "Les contenus signalés par les membres apparaîtront ici.",
          })}
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {r.kind === "comment"
                        ? t("wall.moderation.comment", { defaultValue: "Commentaire" })
                        : t("wall.moderation.post", { defaultValue: "Publication" })}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {REASONS[r.reason] ?? r.reason}
                    </Badge>
                    {r.hidden && (
                      <Badge variant="destructive" className="text-[10px]">
                        {t("wall.moderation.hidden", { defaultValue: "Masqué" })}
                      </Badge>
                    )}
                    {r.deleted && (
                      <Badge variant="destructive" className="text-[10px]">
                        {t("wall.moderation.deleted", { defaultValue: "Supprimé" })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("wall.moderation.by", { defaultValue: "Signalé par" })} {r.reporterName} ·{" "}
                    {fmt(r.created_at, "d MMM HH:mm")}
                  </p>
                </div>
              </div>

              {r.excerpt && (
                <p className="text-sm bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-wrap">
                  {r.excerpt}
                </p>
              )}
              {r.details && (
                <p className="text-xs text-muted-foreground italic">« {r.details} »</p>
              )}

              {(r.status === "pending" || r.status === "reviewing") && !r.deleted && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ reportId: r.id, action: "dismiss" })}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    {t("wall.moderation.dismiss", { defaultValue: "Ignorer" })}
                  </Button>
                  {r.hidden ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ reportId: r.id, action: "unhide" })}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      {t("wall.moderation.unhide", { defaultValue: "Réafficher" })}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ reportId: r.id, action: "hide" })}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1" />
                      {t("wall.moderation.hide", { defaultValue: "Masquer" })}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ reportId: r.id, action: "delete" })}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t("common.delete", { defaultValue: "Supprimer" })}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Report = {
  id: string;
  post_id: string;
  comment_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporterName: string;
  kind: "post" | "comment";
  excerpt: string;
  hidden: boolean;
  deleted: boolean;
};
