import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { WallFeed } from "@/components/wall-feed";
import { useWallUnread } from "@/lib/use-wall-unread";
import { trackWallPostPushOpened } from "@/lib/push-dispatch.functions";
import i18n from "@/lib/i18n";

const inboxSearch = z.object({
  post: z.string().uuid().optional(),
  from: z.enum(["push"]).optional(),
});

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
  validateSearch: (s) => inboxSearch.parse(s),
  head: () => ({
    meta: [
      { title: i18n.t("meta.inbox.title") },
      { name: "description", content: i18n.t("meta.inbox.description") },
    ],
  }),
});

function InboxPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const { markSeen } = useWallUnread(activeClubId);
  const { post: postId, from } = useSearch({ from: "/_authenticated/inbox" });

  // Clear the bell as soon as the user opens the wall.
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  // Push-deep-link analytics: emit wall_post_push_opened AFTER server-side
  // RLS re-check. If the user lost access, the server returns tracked:false
  // and we simply stay on the team wall (no post focus).
  useEffect(() => {
    if (!postId || from !== "push") return;
    trackWallPostPushOpened({ data: { postId } }).catch((e) => {
      console.warn("[analytics] wall_post_push_opened failed", (e as Error).message);
    });
  }, [postId, from]);

  // Best-effort scroll to the post once the feed has rendered it.
  useEffect(() => {
    if (!postId) return;
    const tryScroll = (attempt: number) => {
      const el = document.getElementById(`wall-post-${postId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2400);
        return;
      }
      if (attempt < 10) setTimeout(() => tryScroll(attempt + 1), 250);
    };
    tryScroll(0);
  }, [postId]);

  return (
    <div className="px-5 pt-8 pb-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{t("wall.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wall.subtitle")}</p>
      </header>

      {activeClubId ? (
        <WallFeed clubId={activeClubId} />
      ) : (
        <p className="text-sm text-muted-foreground text-center py-10">{t("wall.noClub")}</p>
      )}
    </div>
  );
}
