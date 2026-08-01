import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { WallFeed } from "@/components/wall-feed";
import { WallDocuments } from "@/components/wall-documents";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWallUnread } from "@/lib/use-wall-unread";
import { scrollToWallPost } from "@/lib/wall/scroll-to-post";
import { trackWallPostPushOpened } from "@/lib/push-dispatch.functions";
import i18n from "@/lib/i18n";

const inboxSearch = z.object({
  post: z.string().uuid().optional(),
  from: z.enum(["push"]).optional(),
  tab: z.enum(["wall", "documents"]).optional(),
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
  const navigate = useNavigate({ from: "/inbox" });
  const { post: postId, from, tab } = useSearch({ from: "/_authenticated/inbox" });
  // Un deep-link push cible toujours une publication précise : il l'emporte sur
  // l'onglet mémorisé dans l'URL, sinon la notification ouvrirait la docuthèque.
  const activeTab = postId ? "wall" : (tab ?? "wall");

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
    return scrollToWallPost(postId);
  }, [postId]);

  return (
    <div className="px-5 pt-8 pb-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{t("wall.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("wall.subtitle")}</p>
      </header>

      {activeClubId ? (
        <Tabs
          value={activeTab}
          onValueChange={(next) =>
            navigate({
              search: (prev) => ({
                ...prev,
                tab: next === "wall" ? undefined : "documents",
                // Changer d'onglet à la main annule le focus sur une publication.
                post: undefined,
                from: undefined,
              }),
              replace: true,
            })
          }
        >
          <TabsList className="mb-4">
            <TabsTrigger value="wall">{t("wall.tabs.wall", { defaultValue: "Mur" })}</TabsTrigger>
            <TabsTrigger value="documents">
              {t("wall.tabs.documents", { defaultValue: "Documents" })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="wall">
            <WallFeed clubId={activeClubId} />
          </TabsContent>
          <TabsContent value="documents">
            <WallDocuments
              clubId={activeClubId}
              onOpenPost={(id) =>
                navigate({ search: (prev) => ({ ...prev, tab: undefined, post: id }) })
              }
            />
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-10">{t("wall.noClub")}</p>
      )}
    </div>
  );
}
