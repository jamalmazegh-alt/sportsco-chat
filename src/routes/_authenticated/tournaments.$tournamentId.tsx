import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useActiveRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Trophy,
  Loader2,
  Users,
  Shuffle,
  ListOrdered,
  Calendar,
  Share2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getTournament,
  updateTournament,
} from "@/modules/tournaments/server/tournaments.functions";
import { TeamsManager } from "@/modules/tournaments/components/TeamsManager";
import { GroupsAndFixtures } from "@/modules/tournaments/components/GroupsAndFixtures";
import { MatchesList } from "@/modules/tournaments/components/MatchesList";
import { StandingsView } from "@/modules/tournaments/components/StandingsView";

export const Route = createFileRoute("/_authenticated/tournaments/$tournamentId")({
  component: TournamentDetailPage,
});

type Tab = "teams" | "fixtures" | "matches" | "standings";

function TournamentDetailPage() {
  const { tournamentId } = Route.useParams();
  const role = useActiveRole();
  const canManage = role === "admin" || role === "dirigeant";

  const getFn = useServerFn(getTournament);
  const updateFn = useServerFn(updateTournament);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => getFn({ data: { tournament_id: tournamentId } }),
  });

  const publish = useMutation({
    mutationFn: (status: "published" | "in_progress" | "completed" | "draft") =>
      updateFn({ data: { tournament_id: tournamentId, patch: { status } } }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const [tab, setTab] = useState<Tab>("teams");

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!q.data) return null;

  const { tournament, groups, teams, matches } = q.data;
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/t/${tournament.slug}`
      : `/t/${tournament.slug}`;

  const tabs: { id: Tab; icon: any; label: string }[] = [
    { id: "teams", icon: Users, label: "Équipes" },
    { id: "fixtures", icon: Shuffle, label: "Format" },
    { id: "matches", icon: Calendar, label: "Matchs" },
    { id: "standings", icon: ListOrdered, label: "Classement" },
  ];

  return (
    <div className="pb-6">
      <header className="px-5 pt-6 pb-4 space-y-3">
        <Link
          to="/tournaments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Tournois
        </Link>
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold truncate">{tournament.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tournament.sport} · {tournament.starts_on}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
            <p className="text-xs mt-1">
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                {tournament.status}
              </span>
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {tournament.status === "draft" && (
              <Button size="sm" onClick={() => publish.mutate("published")}>
                Publier
              </Button>
            )}
            {tournament.status === "published" && (
              <Button size="sm" onClick={() => publish.mutate("in_progress")}>
                Démarrer
              </Button>
            )}
            {tournament.status === "in_progress" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => publish.mutate("completed")}
              >
                Clôturer
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(publicUrl);
                toast.success("Lien copié");
              }}
            >
              <Share2 className="h-4 w-4" />
              Partager
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={`/t/${tournament.slug}`} target="_blank" rel="noreferrer">
                <Eye className="h-4 w-4" />
                Voir la page publique
              </a>
            </Button>
          </div>
        )}
      </header>

      <nav className="px-5 pb-3 sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 min-w-fit flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/40",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="px-5 pt-4">
        {tab === "teams" && (
          <TeamsManager
            tournamentId={tournament.id}
            clubId={tournament.club_id}
            teams={teams as any}
          />
        )}
        {tab === "fixtures" && canManage && (
          <GroupsAndFixtures
            tournamentId={tournament.id}
            format={tournament.format}
            numTeams={teams.length}
            groupsCount={groups.length}
            matchesCount={matches.length}
          />
        )}
        {tab === "fixtures" && !canManage && (
          <p className="text-sm text-muted-foreground">
            Seuls les admins et dirigeants peuvent configurer le format.
          </p>
        )}
        {tab === "matches" && (
          <MatchesList
            tournamentId={tournament.id}
            matches={matches as any}
            teams={teams as any}
          />
        )}
        {tab === "standings" && <StandingsView tournamentId={tournament.id} />}
      </div>
    </div>
  );
}
