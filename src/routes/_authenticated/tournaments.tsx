import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Plus, Trophy, ChevronRight, Calendar } from "lucide-react";
import { listMyTournaments } from "@/modules/tournaments/tournaments.functions";
import { TournamentWizard } from "@/modules/tournaments/components/TournamentWizard";

export const Route = createFileRoute("/_authenticated/tournaments")({
  component: TournamentsRoute,
  head: () => ({ meta: [{ title: "Tournois — Clubero" }] }),
});

function TournamentsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/tournaments") return <Outlet />;
  return <TournamentsList />;
}

function TournamentsList() {
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const canManage = role === "admin" || (role as string) === "dirigeant";
  const [open, setOpen] = useState(false);

  const fn = useServerFn(listMyTournaments);
  const q = useQuery({
    queryKey: ["tournaments", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => fn({ data: { club_id: activeClubId! } }),
  });

  const tournaments = q.data?.tournaments ?? [];

  return (
    <div className="px-5 pt-8 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Tournois
        </h1>
        {canManage && activeClubId && (
          <>
            <Button size="sm" className="h-9" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Créer
            </Button>
            <TournamentWizard
              clubId={activeClubId}
              open={open}
              onOpenChange={setOpen}
            />
          </>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-6 w-6" />}
          title="Aucun tournoi"
          description={
            canManage
              ? "Crée ton premier tournoi pour organiser une compétition."
              : "Aucun tournoi n'est en cours dans ce club."
          }
          action={
            canManage ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                Créer un tournoi
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2">
          {tournaments.map((t: any) => (
            <li key={t.id}>
              <Link
                to="/tournaments/$tournamentId"
                params={{ tournamentId: t.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99] transition-transform"
              >
                <div className="h-14 w-14 rounded-xl bg-primary/10 shrink-0 overflow-hidden flex items-center justify-center">
                  {t.cover_image_url ? (
                    <img
                      src={t.cover_image_url}
                      alt={t.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Trophy className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {t.starts_on}
                    {" · "}
                    {t.sport}
                    {" · "}
                    <StatusBadge status={t.status} />
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: "Brouillon",
    published: "Publié",
    in_progress: "En cours",
    completed: "Terminé",
    cancelled: "Annulé",
  };
  return <span>{labels[status] ?? status}</span>;
}
