import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Flag, Eye, EyeOff, Trash2, Check, Loader2, UserRound, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/date-locale";
import { listWallReports, resolveWallReport } from "@/lib/wall/moderation.functions";
import { listUserReports, resolveUserReport } from "@/lib/user-report.functions";
import {
  listEventMessageReports,
  resolveEventMessageReport,
} from "@/lib/event-message-report.functions";
import { sortByCreatedAtDesc } from "@/lib/moderation-helpers";

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
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
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
  const listUsers = useServerFn(listUserReports);
  const resolveUser = useServerFn(resolveUserReport);
  const listChat = useServerFn(listEventMessageReports);
  const resolveChat = useServerFn(resolveEventMessageReport);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [kind, setKind] = useState<"content" | "members">("content");

  const { data, isLoading } = useQuery({
    queryKey: ["wall-reports", activeClubId, status],
    enabled: !!activeClubId && kind === "content",
    queryFn: async () =>
      (await list({ data: { clubId: activeClubId as string, status } })) as
        | { reports: Report[] }
        | undefined,
  });

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ["user-reports", activeClubId, status],
    enabled: !!activeClubId && kind === "members",
    queryFn: async () =>
      (await listUsers({ data: { clubId: activeClubId as string, status } })) as
        | { reports: UserReport[] }
        | undefined,
  });

  const { data: chatData, isLoading: chatLoading } = useQuery({
    queryKey: ["chat-reports", activeClubId, status],
    enabled: !!activeClubId && kind === "content",
    queryFn: async () =>
      (await listChat({ data: { clubId: activeClubId as string, status } })) as
        | { reports: ChatReport[] }
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

  const userMutation = useMutation({
    mutationFn: async (vars: { reportId: string; action: string }) =>
      resolveUser({ data: vars as never }),
    onSuccess: () => {
      toast.success(t("wall.moderation.done", { defaultValue: "Signalement traité" }));
      qc.invalidateQueries({ queryKey: ["user-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chatMutation = useMutation({
    mutationFn: async (vars: { reportId: string; action: string }) =>
      resolveChat({ data: vars as never }),
    onSuccess: () => {
      toast.success(t("wall.moderation.done", { defaultValue: "Signalement traité" }));
      qc.invalidateQueries({ queryKey: ["chat-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reports = useMemo(() => data?.reports ?? [], [data]);
  const userReports = useMemo(() => userData?.reports ?? [], [userData]);
  const chatReports = useMemo(() => chatData?.reports ?? [], [chatData]);
  // Onglet « Contenus » : signalements du mur et du chat fusionnés par date.
  const contentItems = useMemo(
    () =>
      sortByCreatedAtDesc([
        ...reports.map((r) => ({ source: "wall" as const, created_at: r.created_at, wall: r })),
        ...chatReports.map((c) => ({
          source: "chat" as const,
          created_at: c.created_at,
          chat: c,
        })),
      ]),
    [reports, chatReports],
  );

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

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
        <button
          onClick={() => setKind("content")}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            kind === "content" ? "bg-card shadow-sm" : "text-muted-foreground",
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {t("userReport.tabContent", { defaultValue: "Contenus" })}
        </button>
        <button
          onClick={() => setKind("members")}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            kind === "members" ? "bg-card shadow-sm" : "text-muted-foreground",
          )}
        >
          <UserRound className="h-3.5 w-3.5" />
          {t("userReport.tabMembers", { defaultValue: "Membres" })}
        </button>
      </div>

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

      {kind === "content" &&
        (isLoading || chatLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : contentItems.length === 0 ? (
          <EmptyState
            icon={<Flag className="h-5 w-5" />}
            title={t("wall.moderation.empty", { defaultValue: "Aucun signalement" })}
            description={t("wall.moderation.emptyHint", {
              defaultValue: "Les contenus signalés par les membres apparaîtront ici.",
            })}
          />
        ) : (
          <ul className="space-y-3">
            {contentItems.map((item) => {
              if (item.source === "chat") {
                const c = item.chat;
                return (
                  <li
                    key={`chat-${c.id}`}
                    className="rounded-xl border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {t("chatReport.badge", { defaultValue: "Message de chat" })}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {REASONS[c.reason] ?? c.reason}
                      </Badge>
                      {c.deleted && (
                        <Badge variant="destructive" className="text-[10px]">
                          {t("wall.moderation.deleted", { defaultValue: "Supprimé" })}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("wall.moderation.by", { defaultValue: "Signalé par" })}{" "}
                      <span className="font-medium text-foreground">{c.reporterName}</span> ·{" "}
                      {fmt(c.created_at, "d MMM HH:mm")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("wall.moderation.author", { defaultValue: "Écrit par" })}{" "}
                      <span className="font-medium text-foreground">{c.authorName}</span>
                    </p>
                    {c.excerpt && (
                      <p className="text-sm bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {c.excerpt}
                      </p>
                    )}
                    {c.details && (
                      <p className="text-xs text-muted-foreground italic">« {c.details} »</p>
                    )}
                    {(c.status === "pending" || c.status === "reviewing") && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={chatMutation.isPending}
                          onClick={() => chatMutation.mutate({ reportId: c.id, action: "dismiss" })}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {t("wall.moderation.dismiss", { defaultValue: "Ignorer" })}
                        </Button>
                        {!c.deleted && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={chatMutation.isPending}
                            onClick={() =>
                              chatMutation.mutate({ reportId: c.id, action: "delete" })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            {t("chatReport.deleteMessage", {
                              defaultValue: "Supprimer le message",
                            })}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={chatMutation.isPending}
                          onClick={() =>
                            chatMutation.mutate({ reportId: c.id, action: "actioned" })
                          }
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          {t("userReport.markActioned", { defaultValue: "Marquer traité" })}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              }
              const r = item.wall;
              return (
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
                        {t("wall.moderation.by", { defaultValue: "Signalé par" })}{" "}
                        <span className="font-medium text-foreground">{r.reporterName}</span> ·{" "}
                        {fmt(r.created_at, "d MMM HH:mm")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("wall.moderation.author", { defaultValue: "Écrit par" })}{" "}
                        <span className="font-medium text-foreground">{r.authorName}</span>
                        {r.contentCreatedAt ? ` · ${fmt(r.contentCreatedAt, "d MMM HH:mm")}` : ""}
                      </p>
                    </div>
                  </div>

                  {r.excerpt && (
                    <p className="text-sm bg-muted/40 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {r.excerpt}
                    </p>
                  )}

                  {r.kind === "comment" && (
                    <div className="rounded-lg border border-dashed border-border px-3 py-2 space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t("wall.moderation.originalPost", {
                          defaultValue: "Publication d'origine",
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("wall.moderation.author", { defaultValue: "Écrit par" })}{" "}
                        <span className="font-medium text-foreground">{r.postAuthorName}</span>
                        {r.postCreatedAt ? ` · ${fmt(r.postCreatedAt, "d MMM HH:mm")}` : ""}
                        {r.postHidden
                          ? ` · ${t("wall.moderation.hidden", { defaultValue: "Masqué" })}`
                          : ""}
                        {r.postDeleted
                          ? ` · ${t("wall.moderation.deleted", { defaultValue: "Supprimé" })}`
                          : ""}
                      </p>
                      {r.postExcerpt && (
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">{r.postExcerpt}</p>
                      )}
                    </div>
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
              );
            })}
          </ul>
        ))}

      {kind === "members" &&
        (userLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : userReports.length === 0 ? (
          <EmptyState
            icon={<UserRound className="h-5 w-5" />}
            title={t("wall.moderation.empty", { defaultValue: "Aucun signalement" })}
            description={t("userReport.emptyHint", {
              defaultValue: "Les membres signalés apparaîtront ici.",
            })}
          />
        ) : (
          <ul className="space-y-3">
            {userReports.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {t("userReport.tabMembers", { defaultValue: "Membres" })}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {REASONS[r.reason] ?? r.reason}
                  </Badge>
                </div>
                <p className="text-sm">
                  <span className="font-semibold">{r.reportedName}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("wall.moderation.by", { defaultValue: "Signalé par" })}{" "}
                  <span className="font-medium text-foreground">{r.reporterName}</span> ·{" "}
                  {fmt(r.created_at, "d MMM HH:mm")}
                </p>
                {r.details && (
                  <p className="text-xs text-muted-foreground italic">« {r.details} »</p>
                )}
                {(r.status === "pending" || r.status === "reviewing") && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={userMutation.isPending}
                      onClick={() => userMutation.mutate({ reportId: r.id, action: "dismiss" })}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {t("wall.moderation.dismiss", { defaultValue: "Ignorer" })}
                    </Button>
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={userMutation.isPending}
                        onClick={() => userMutation.mutate({ reportId: r.id, action: "reviewing" })}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        {t("userReport.markReviewing", { defaultValue: "Examiner" })}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={userMutation.isPending}
                      onClick={() => userMutation.mutate({ reportId: r.id, action: "actioned" })}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {t("userReport.markActioned", { defaultValue: "Marquer traité" })}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

type ChatReport = {
  id: string;
  event_id: string;
  message_id: string | null;
  excerpt: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporterName: string;
  authorName: string;
  deleted: boolean;
};

type UserReport = {
  id: string;
  reported_user_id: string;
  reporter_user_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reportedName: string;
  reporterName: string;
};

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
  authorName: string;
  contentCreatedAt: string | null;
  postAuthorName: string;
  postExcerpt: string;
  postCreatedAt: string | null;
  postAudience: string | null;
  postHidden: boolean;
  postDeleted: boolean;
  hidden: boolean;
  deleted: boolean;
};
