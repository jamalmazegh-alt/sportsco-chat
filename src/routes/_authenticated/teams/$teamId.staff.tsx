import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Lock, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/lib/auth-context";
import { WallFeed } from "@/components/wall-feed";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/teams/$teamId/staff")({
  component: TeamStaffWall,
  head: () => ({
    meta: [
      { title: i18n.t("teams.staffWall", { defaultValue: "Mur Staff" }) },
      {
        name: "description",
        content: i18n.t("teams.staffWallHint", {
          defaultValue:
            "Espace privé des éducateurs et dirigeants de l'équipe. Non visible par les joueurs ni les parents.",
        }),
      },
    ],
  }),
});

function TeamStaffWall() {
  const { teamId } = Route.useParams();
  const { t } = useTranslation();
  const roles = useMyRoles();

  const { data: team, isLoading } = useQuery({
    queryKey: ["team-staff-wall", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, club_id")
        .eq("id", teamId)
        .maybeSingle();
      return data;
    },
  });

  const canAccess =
    roles.includes("admin") ||
    roles.includes("dirigeant") ||
    roles.includes("coach") ||
    roles.includes("assistant_coach");

  if (isLoading) return null;
  if (!team) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">{t("common.notFound", { defaultValue: "Introuvable" })}</p>
      </div>
    );
  }
  if (!canAccess) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          {t("common.forbidden", { defaultValue: "Accès refusé" })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          to="/teams/$teamId"
          params={{ teamId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {(team as any).name}
        </Link>
      </div>
      <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-3">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-violet-600 dark:text-violet-300" />
          <h1 className="text-base font-semibold">
            {t("teams.staffWall", { defaultValue: "Mur Staff" })}
          </h1>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("teams.staffWallHint", {
            defaultValue:
              "Espace privé des éducateurs et dirigeants de l'équipe. Non visible par les joueurs ni les parents.",
          })}
        </p>
      </div>
      <WallFeed clubId={(team as any).club_id} staffTeamId={teamId} />
    </div>
  );
}
