import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WallFeed } from "@/components/wall-feed";
import { WallDocuments } from "@/components/wall-documents";
import { scrollToWallPost } from "@/lib/wall/scroll-to-post";
import { useAuth } from "@/lib/auth-context";
import i18n from "@/lib/i18n";

function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-destructive">{String(error?.message ?? error)}</p>
      <Button
        onClick={() => {
          reset();
          router.invalidate();
        }}
        size="sm"
      >
        {t("common.retry", { defaultValue: "Réessayer" })}
      </Button>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/teams/$teamId_/staff")({
  component: TeamStaffWallPage,
  head: () => ({
    meta: [
      { title: "Mur Staff — Clubero" },
      {
        name: "description",
        content: "Espace privé des éducateurs et dirigeants de l'équipe.",
      },
      { property: "og:title", content: "Mur Staff — Clubero" },
      {
        property: "og:description",
        content: "Espace privé des éducateurs et dirigeants de l'équipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ErrorBoundary,
  notFoundComponent: () => <div className="p-6 text-sm">{i18n.t("teams.notFound")}</div>,
});

function TeamStaffWallPage() {
  const { teamId } = Route.useParams();
  const { t } = useTranslation();
  const { memberships, activeClubId } = useAuth();
  const [tab, setTab] = useState<"wall" | "documents">("wall");
  // Conservé (et non consommé une fois pour toutes) : le fil s'en sert pour
  // aller chercher la publication visée si elle est hors des 50 dernières.
  const [focusPostId, setFocusPostId] = useState<string | null>(null);

  // « Voir la publication » depuis la docuthèque : le feed doit d'abord être
  // remonté, le helper réessaie jusqu'à ce que l'ancre existe.
  useEffect(() => {
    if (tab !== "wall" || !focusPostId) return;
    return scrollToWallPost(focusPostId);
  }, [tab, focusPostId]);

  const { data: team, isLoading } = useQuery({
    queryKey: ["team-basic", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, club_id")
        .eq("id", teamId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const activeMembership = memberships.find((m) => m.club_id === (team?.club_id ?? activeClubId));
  const roles = new Set<string>(activeMembership?.roles ?? []);
  const isStaff =
    roles.has("admin") ||
    roles.has("dirigeant") ||
    roles.has("coach") ||
    roles.has("assistant_coach");

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
  }
  if (!team) {
    return <div className="p-6 text-sm">{t("teams.notFound")}</div>;
  }
  if (!isStaff) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("teams.staffWallForbidden", {
            defaultValue: "Cet espace est réservé aux éducateurs et dirigeants de l'équipe.",
          })}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/teams/$teamId" params={{ teamId }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            {t("common.back", { defaultValue: "Retour" })}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button asChild size="icon" variant="ghost">
          <Link to="/teams/$teamId" params={{ teamId }} aria-label={t("teams.backToTeam")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-violet-500 shrink-0" />
            <h1 className="text-lg font-semibold truncate">
              {t("teams.staffWall", { defaultValue: "Mur Staff" })} · {team.name}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("teams.staffWallHint", {
              defaultValue:
                "Espace privé des éducateurs et dirigeants de l'équipe. Non visible par les joueurs ni les parents.",
            })}
          </p>
        </div>
      </div>

      {team.club_id && (
        <Tabs value={tab} onValueChange={(next) => setTab(next as "wall" | "documents")}>
          <TabsList className="mb-4">
            <TabsTrigger value="wall">{t("wall.tabs.wall", { defaultValue: "Mur" })}</TabsTrigger>
            <TabsTrigger value="documents">
              {t("wall.tabs.documents", { defaultValue: "Documents" })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="wall">
            <WallFeed
              clubId={team.club_id}
              staffTeamId={teamId}
              focusPostId={focusPostId ?? undefined}
            />
          </TabsContent>
          <TabsContent value="documents">
            <WallDocuments
              clubId={team.club_id}
              staffTeamId={teamId}
              onOpenPost={(postId) => {
                // Pas de deep-link ?post= sur cette route : on revient au mur et
                // on laisse le feed se monter avant de viser l'ancre.
                setTab("wall");
                setFocusPostId(postId);
              }}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
