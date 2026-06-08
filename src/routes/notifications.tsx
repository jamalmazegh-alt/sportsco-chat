import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell, CheckCheck, ChevronRight, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { requireAuthBeforeLoad } from "@/lib/route-guards";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import i18nInstance from "@/lib/i18n";

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export const Route = createFileRoute("/notifications")({
  beforeLoad: requireAuthBeforeLoad,
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.notifications.title") },
      { name: "description", content: i18nInstance.t("meta.notifications.description") },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function normalizeNotificationLink(link: string | null): string | null {
  if (!link) return null;
  if (link === "/wall") return "/inbox";
  if (link.startsWith("/wall#")) return link.replace("/wall#", "/inbox#");
  return link;
}

function formatNotificationDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications-center", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, link, read_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-center", user?.id] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    },
  });

  const notifications = query.data ?? [];
  const unread = notifications.filter((notification) => !notification.read_at);
  const unreadCount = unread.length;

  function markAllRead() {
    markRead.mutate(unread.map((notification) => notification.id));
  }

  function markOneRead(notification: NotificationRow) {
    if (!notification.read_at) markRead.mutate([notification.id]);
  }

  return (
    <main className="min-h-screen bg-background px-5 py-5">
      <div className="mx-auto max-w-xl space-y-5">
        <BackLink to="/home" label={t("common.back")} />

        <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {t("notificationsCenter.title")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("notificationsCenter.subtitle")}
                </p>
              </div>
            </div>
            {unreadCount > 0 && (
              <Badge className="shrink-0">
                {t("notificationsCenter.unreadBadge", { count: unreadCount })}
              </Badge>
            )}
          </div>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={markAllRead}
              disabled={markRead.isPending}
            >
              {markRead.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              {t("notificationsCenter.markAllRead")}
            </Button>
          )}
        </header>

        {query.isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {query.isError && (
          <EmptyState
            icon={<Bell className="h-5 w-5" />}
            title={t("common.errorTitle")}
            description={t("notificationsCenter.loadError")}
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        )}

        {!query.isLoading && !query.isError && notifications.length === 0 && (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title={t("notificationsCenter.emptyTitle")}
            description={t("notificationsCenter.emptyDescription")}
          />
        )}

        {notifications.length > 0 && (
          <ul className="space-y-2">
            {notifications.map((notification) => {
              const href = normalizeNotificationLink(notification.link);
              const unreadItem = !notification.read_at;
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {unreadItem && (
                        <span
                          aria-label={t("notificationsCenter.unread")}
                          className="h-2 w-2 rounded-full bg-primary"
                        />
                      )}
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {notification.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatNotificationDate(notification.created_at, i18n.language)}
                      </span>
                    </div>
                    {notification.body && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {notification.body}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {notification.type}
                      </Badge>
                      {unreadItem && (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={(event) => {
                            event.preventDefault();
                            markOneRead(notification);
                          }}
                        >
                          {t("notificationsCenter.markRead")}
                        </button>
                      )}
                    </div>
                  </div>
                  {href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </>
              );

              return (
                <li key={notification.id}>
                  {href ? (
                    <a
                      href={href}
                      onClick={() => markOneRead(notification)}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border p-4 transition-colors",
                        unreadItem
                          ? "border-primary/25 bg-primary/5 hover:bg-primary/10"
                          : "border-border bg-card hover:bg-muted/40",
                      )}
                    >
                      {content}
                    </a>
                  ) : (
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border p-4",
                        unreadItem ? "border-primary/25 bg-primary/5" : "border-border bg-card",
                      )}
                    >
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
