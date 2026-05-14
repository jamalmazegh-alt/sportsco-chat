import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { WallFeed } from "@/components/wall-feed";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wall")({
  component: WallPage,
  head: () => ({ meta: [{ title: "Wall — Clubero" }] }),
});

function WallPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();

  if (!activeClubId) return null;

  return (
    <div className="px-5 py-4 space-y-4">
      <header className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("wall.title")}</h1>
      </header>
      <WallFeed clubId={activeClubId} />
    </div>
  );
}
