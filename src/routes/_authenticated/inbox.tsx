import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Inbox as InboxIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WallFeed } from "@/components/wall-feed";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
  head: () => ({ meta: [{ title: "Inbox — Clubero" }] }),
});

function InboxPage() {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const qc = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, link, read_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  // Mark all as read on view
  useEffect(() => {
    if (!user || !notifications) return;
    const unread = notifications.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unread.map((n) => n.id))
      .then(() => qc.invalidateQueries({ queryKey: ["notifications"] }));
  }, [notifications, user, qc]);

  return (
    <div className="px-5 pt-8 pb-6 space-y-5">
      <h1 className="text-2xl font-semibold">{t("inbox.title")}</h1>

      <Tabs defaultValue="notifications" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="notifications">{t("inbox.tabNotifications")}</TabsTrigger>
          <TabsTrigger value="wall">{t("wall.title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          {!notifications || notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <InboxIcon className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">{t("inbox.noNotifications")}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const Wrap: any = n.link ? Link : "div";
                const wrapProps = n.link ? { to: n.link } : {};
                return (
                  <li key={n.id}>
                    <Wrap
                      {...wrapProps}
                      className={cn(
                        "block rounded-2xl border border-border bg-card p-4",
                        !n.read_at && "border-primary/40 bg-primary/5"
                      )}
                    >
                      <p className="font-medium text-sm">{n.title}</p>
                      {n.body && <p className="text-sm text-muted-foreground mt-1">{n.body}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </Wrap>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="wall">
          {activeClubId ? (
            <WallFeed clubId={activeClubId} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">{t("wall.noClub")}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
