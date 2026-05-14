import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { WallFeed } from "@/components/wall-feed";
import { useWallUnread } from "@/lib/use-wall-unread";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
  head: () => ({ meta: [{ title: "Wall — Clubero" }] }),
});

function InboxPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const { markSeen } = useWallUnread(activeClubId);

  // Clear the bell as soon as the user opens the wall.
  useEffect(() => {
    markSeen();
  }, [markSeen]);

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
