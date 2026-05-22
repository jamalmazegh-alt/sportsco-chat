import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Trophy,
  Calendar,
  MapPin,
  Loader2,
  Tv,
  ListOrdered,
  Users,
  GitBranch,
  CalendarDays,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getPublicTournament } from "@/modules/tournaments/tournaments.functions";
import { BracketView } from "@/modules/tournaments/components/BracketView";
import { PublicStandings } from "@/modules/tournaments/components/PublicStandings";
import { mergeRules } from "@/modules/tournaments/lib/rules";
import { SponsorsStrip } from "@/modules/tournaments/components/SponsorsStrip";
import { resolveScoring, formatSets, type ScoringRules } from "@/modules/tournaments/lib/formats";

export const Route = createFileRoute("/tournament/$slug")({
  component: PublicTournamentPage,
  loader: async ({ params }) => {
    const data = await getPublicTournament({ data: { slug: params.slug } });
    return { initial: data };
  },
  head: ({ loaderData, params }) => {
    const t = loaderData?.initial?.tournament as any;
    const title = t?.name
      ? `${t.name} — Tournoi ${t.sport ?? ""}`.trim() + " · Clubero"
      : `Tournoi ${params.slug} — Clubero`;
    const desc = t
      ? `Suivez ${t.name} en direct : équipes, calendrier, résultats et classements${
          t.location ? ` · ${t.location}` : ""
        }.`
      : "Suivez ce tournoi en direct : équipes, calendrier, résultats et classements.";
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (t?.cover_image_url) {
      meta.push({ property: "og:image", content: t.cover_image_url });
      meta.push({ name: "twitter:image", content: t.cover_image_url });
    }
    return { meta };
  },
});

type Tab = "overview" | "teams" | "matches" | "standings" | "bracket";

function PublicTournamentPage() {
  const { slug } = Route.useParams();
  const initial = Route.useLoaderData().initial;
  const fn = useServerFn(getPublicTournament);
  const q = useQuery({
    queryKey: ["public-tournament", slug],
    queryFn: () => fn({ data: { slug } }),
    initialData: initial ?? undefined,
    refetchInterval: 30_000,
  });
  const [tab, setTab] = useState<Tab>("overview");

  if (q.isLoading && !q.data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-2 max-w-md">
          <Trophy className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-lg font-medium">Tournoi indisponible</p>
          <p className="text-sm text-muted-foreground">
            Ce tournoi n'est pas encore publié, ou le lien est expiré. Si tu es l'organisateur, ouvre ton tournoi puis clique sur <strong>Publier</strong>.
          </p>
          <Link to="/" className="text-sm text-primary underline">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    );
  }

  const { tournament, groups, teams, matches } = q.data;
  const rules = mergeRules((tournament as any).settings);
  const scoring = resolveScoring(
    (tournament as any).sport,
    ((tournament as any).settings as any)?.scoring,
  );
  const now = Date.now();
  const opens = rules.registration.opensAt ? new Date(rules.registration.opensAt).getTime() : null;
  const closes = rules.registration.closesAt ? new Date(rules.registration.closesAt).getTime() : null;
  const registrationOpen =
    rules.registration.enabled &&
    (opens === null || now >= opens) &&
    (closes === null || now <= closes);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Aperçu", icon: CalendarDays },
    { id: "teams", label: "Équipes", icon: Users },
    { id: "matches", label: "Matchs", icon: Calendar },
    { id: "standings", label: "Classement", icon: ListOrdered },
    { id: "bracket", label: "Bracket", icon: GitBranch },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        {tournament.cover_image_url ? (
          <div className="h-40 w-full overflow-hidden">
            <img
              src={tournament.cover_image_url}
              alt={tournament.name}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-32 w-full bg-gradient-to-br from-primary/20 via-primary/10 to-background" />
        )}
        <div className="max-w-3xl mx-auto px-5 -mt-10 relative">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Trophy className="h-7 w-7 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold truncate">{tournament.name}</h1>
                <div className="text-sm text-muted-foreground mt-1 space-y-1">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {tournament.starts_on}
                    {tournament.ends_on ? ` → ${tournament.ends_on}` : ""}
                  </p>
                  {tournament.location && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {tournament.location}
                    </p>
                  )}
                  <p className="text-xs">
                    {tournament.sport}
                    {tournament.category ? ` · ${tournament.category}` : ""} ·{" "}
                    <span className="font-medium">{tournament.status}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {registrationOpen && (
                  <Button asChild size="sm">
                    <Link to="/tournament/$slug/register" params={{ slug }}>
                      <UserPlus className="h-4 w-4" />
                      S'inscrire
                    </Link>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to="/tournament/$slug/tv" params={{ slug }}>
                    <Tv className="h-4 w-4" />
                    Diaporama TV
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 mt-5">
        <nav className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border -mx-5 px-5 py-2">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "min-w-fit flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
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

        <div className="py-5">
          {tab === "overview" && (
            <Overview groups={groups} teams={teams} matches={matches} scoring={scoring} />
          )}
          {tab === "teams" && <TeamsGrid teams={teams as any} />}
          {tab === "matches" && (
            <PublicMatches matches={matches as any} teams={teams as any} scoring={scoring} />
          )}
          {tab === "standings" && (
            <PublicStandings
              groups={groups as any}
              teams={teams as any}
              matches={matches as any}
            />
          )}
          {tab === "bracket" && (
            <BracketView matches={matches as any} teams={teams as any} />
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({
  groups,
  teams,
  matches,
  scoring,
}: {
  groups: any[];
  teams: any[];
  matches: any[];
  scoring: ScoringRules;
}) {
  const teamMap = new Map(teams.map((t: any) => [t.id, t]));
  const upcoming = matches.filter((m: any) => m.status === "scheduled").slice(0, 5);
  const recent = matches.filter((m: any) => m.status === "completed").slice(-5).reverse();

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card title="Prochains matchs" empty="Aucun match programmé">
        {upcoming.map((m: any) => (
          <MatchRow key={m.id} match={m} teamMap={teamMap} scoring={scoring} />
        ))}
      </Card>
      <Card title="Derniers résultats" empty="Aucun résultat pour le moment">
        {recent.map((m: any) => (
          <MatchRow key={m.id} match={m} teamMap={teamMap} scoring={scoring} />
        ))}
      </Card>
      <Card title="Format">
        <p className="text-sm text-muted-foreground p-3">
          {groups.length} poule{groups.length > 1 ? "s" : ""} · {teams.length}{" "}
          équipes · {matches.length} matchs
        </p>
      </Card>
    </div>
  );
}

function Card({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children?: React.ReactNode;
}) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="px-3 py-2 border-b border-border bg-muted/40">
        <h3 className="font-medium text-sm">{title}</h3>
      </header>
      {hasContent ? (
        <ul className="divide-y divide-border">{children}</ul>
      ) : (
        <p className="px-3 py-4 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function MatchRow({
  match,
  teamMap,
  scoring,
}: {
  match: any;
  teamMap: Map<string, any>;
  scoring: ScoringRules;
}) {
  const a = match.team_a_id ? teamMap.get(match.team_a_id) : null;
  const b = match.team_b_id ? teamMap.get(match.team_b_id) : null;
  const setsLine = scoring.mode === "sets" ? formatSets(match.sets) : "";
  return (
    <li className="px-3 py-2 text-sm">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="truncate text-right">{a?.name ?? "TBD"}</span>
        <span className="tabular-nums font-semibold">
          {match.score_a ?? "–"} : {match.score_b ?? "–"}
        </span>
        <span className="truncate">{b?.name ?? "TBD"}</span>
      </div>
      {setsLine && (
        <div className="text-[11px] text-muted-foreground text-center mt-0.5 tabular-nums">
          {setsLine}
        </div>
      )}
    </li>
  );
}

function TeamsGrid({ teams }: { teams: any[] }) {
  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Aucune équipe inscrite.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {teams.map((t) => (
        <li
          key={t.id}
          className="rounded-xl border border-border bg-card p-3 text-center"
        >
          <div className="h-12 w-12 mx-auto rounded-lg bg-muted overflow-hidden flex items-center justify-center mb-2">
            {t.logo_url ? (
              <img src={t.logo_url} alt={t.name} className="h-full w-full object-cover" />
            ) : (
              <Users className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm font-medium truncate">{t.name}</p>
        </li>
      ))}
    </ul>
  );
}

function PublicMatches({
  matches,
  teams,
  scoring,
}: {
  matches: any[];
  teams: any[];
  scoring: ScoringRules;
}) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Aucun match programmé.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const setsLine = scoring.mode === "sets" ? formatSets(m.sets) : "";
        return (
          <li
            key={m.id}
            className="rounded-xl border border-border bg-card p-3"
          >
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <span className="truncate text-right text-sm font-medium">
                {teamMap.get(m.team_a_id)?.name ?? "TBD"}
              </span>
              <span className="tabular-nums font-bold">
                {m.score_a ?? "–"} : {m.score_b ?? "–"}
              </span>
              <span className="truncate text-sm font-medium">
                {teamMap.get(m.team_b_id)?.name ?? "TBD"}
              </span>
            </div>
            {setsLine && (
              <div className="text-xs text-muted-foreground text-center mt-1 tabular-nums">
                {setsLine}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
