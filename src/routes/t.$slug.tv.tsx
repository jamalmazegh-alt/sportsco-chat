/**
 * TV mode — page kiosque pour affichage en salle club.
 * Affiche prochains matchs, derniers résultats, mini-classement.
 * Refresh auto toutes les 15s.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { Trophy, Calendar, Loader2 } from "lucide-react";
import { getPublicTournament } from "@/modules/tournaments/server/tournaments.functions";
import { computeStandings } from "@/modules/tournaments/lib/standings";

type TvTeam = { id: string; name: string; group_id: string | null };

export const Route = createFileRoute("/t/$slug/tv")({
  component: TvModePage,
  head: ({ params }) => ({
    meta: [{ title: `TV — Tournoi ${params.slug}` }],
  }),
});

function TvModePage() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getPublicTournament);
  const q = useQuery({
    queryKey: ["public-tournament-tv", slug],
    queryFn: () => fn({ data: { slug } }),
    refetchInterval: 15_000,
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const { tournament, groups, teams, matches } = q.data;
  const teamMap = new Map<string, TvTeam>(teams.map((t: any) => [t.id, t as TvTeam]));

  const upcoming = matches
    .filter((m: any) => m.status === "scheduled" || m.status === "live")
    .slice(0, 6);
  const recent = matches
    .filter((m: any) => m.status === "completed")
    .slice(-6)
    .reverse();

  const sortedGroups = [...groups].sort(
    (a: any, b: any) => a.sort_order - b.sort_order,
  );

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <header className="border-b border-border bg-card px-8 py-5 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Trophy className="h-7 w-7 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold truncate">{tournament.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tournament.sport}
            {tournament.location ? ` · ${tournament.location}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Statut
          </p>
          <p className="text-lg font-semibold">{tournament.status}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-8">
        <Section title="Prochains matchs" icon={<Calendar className="h-5 w-5" />}>
          {upcoming.length === 0 ? (
            <Empty>Aucun match programmé</Empty>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((m: any) => (
                <TvMatch key={m.id} match={m} teamMap={teamMap} live={m.status === "live"} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Derniers résultats" icon={<Trophy className="h-5 w-5" />}>
          {recent.length === 0 ? (
            <Empty>Aucun résultat</Empty>
          ) : (
            <ul className="space-y-2">
              {recent.map((m: any) => (
                <TvMatch key={m.id} match={m} teamMap={teamMap} finished />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Classements" icon={<Trophy className="h-5 w-5" />}>
          {sortedGroups.length === 0 ? (
            <Empty>Pas de phase de groupes</Empty>
          ) : (
            <div className="space-y-4">
              {sortedGroups.map((g: any) => {
                const ids = teams
                  .filter((t: any) => t.group_id === g.id)
                  .map((t: any) => t.id);
                const gMatches = matches
                  .filter((m: any) => m.round === "group" && m.group_id === g.id)
                  .map((m: any) => ({
                    teamAId: m.team_a_id,
                    teamBId: m.team_b_id,
                    scoreA: m.score_a,
                    scoreB: m.score_b,
                    status: m.status,
                  }));
                const rows = computeStandings(ids, gMatches).slice(0, 4);
                return (
                  <div key={g.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/40 text-sm font-semibold">
                      {g.name}
                    </div>
                    <ul className="divide-y divide-border text-sm">
                      {rows.map((r, i) => {
                        const t = teamMap.get(r.teamId);
                        const qualified = i < g.qualifiers_count;
                        return (
                          <li
                            key={r.teamId}
                            className={`flex items-center justify-between px-3 py-1.5 ${
                              qualified ? "bg-primary/5" : ""
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span className="text-xs text-muted-foreground tabular-nums w-4">
                                {i + 1}
                              </span>
                              <span className="font-medium truncate">
                                {t?.name ?? "—"}
                              </span>
                            </span>
                            <span className="font-bold tabular-nums">
                              {r.points}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      <footer className="fixed bottom-3 right-4 text-xs text-muted-foreground">
        Mis à jour automatiquement · Clubero Tournaments
      </footer>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-primary">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function TvMatch({
  match,
  teamMap,
  live,
  finished,
}: {
  match: any;
  teamMap: Map<string, any>;
  live?: boolean;
  finished?: boolean;
}) {
  const a = match.team_a_id ? teamMap.get(match.team_a_id) : null;
  const b = match.team_b_id ? teamMap.get(match.team_b_id) : null;
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>
          {match.scheduled_at
            ? new Date(match.scheduled_at).toLocaleString()
            : "—"}
          {match.field ? ` · ${match.field}` : ""}
        </span>
        {live && (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            LIVE
          </span>
        )}
        {finished && <span className="text-emerald-600 font-medium">FT</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate text-right font-medium">{a?.name ?? "TBD"}</span>
        <span className="tabular-nums font-bold text-xl">
          {match.score_a ?? "–"} : {match.score_b ?? "–"}
        </span>
        <span className="truncate font-medium">{b?.name ?? "TBD"}</span>
      </div>
    </li>
  );
}
