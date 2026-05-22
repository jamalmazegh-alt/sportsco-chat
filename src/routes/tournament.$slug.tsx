import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import i18n from "@/lib/i18n";
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
  Radio,
  Filter,
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
    const data = loaderData?.initial?.tournament as any;
    const title = data?.name
      ? i18n.t("public.metaTitle", {
          ns: "tournaments",
          name: data.name,
          sport: data.sport ?? "",
        }).trim() + " · Clubero"
      : i18n.t("public.metaTitleFallback", {
          ns: "tournaments",
          slug: params.slug,
        });
    const desc = data
      ? i18n.t("public.metaDesc", {
          ns: "tournaments",
          name: data.name,
          locationSuffix: data.location ? ` · ${data.location}` : "",
        })
      : i18n.t("public.metaDescFallback", { ns: "tournaments" });
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (data?.cover_image_url) {
      meta.push({ property: "og:image", content: data.cover_image_url });
      meta.push({ name: "twitter:image", content: data.cover_image_url });
    }
    return { meta };
  },
});

type Tab = "overview" | "teams" | "matches" | "standings" | "bracket";

function PublicTournamentPage() {
  const { slug } = Route.useParams();
  const { t } = useTranslation("tournaments");
  const initial = Route.useLoaderData().initial;
  const fn = useServerFn(getPublicTournament);
  const q = useQuery({
    queryKey: ["public-tournament", slug],
    queryFn: () => fn({ data: { slug } }),
    initialData: initial ?? undefined,
    refetchInterval: (query) => {
      const d: any = query.state.data;
      const hasLive = Array.isArray(d?.matches) && d.matches.some((m: any) => m.status === "live");
      return hasLive ? 10_000 : 30_000;
    },
  });
  const [tab, setTab] = useState<Tab>("overview");
  const [teamFilter, setTeamFilter] = useState<string>("all");


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
          <p className="text-lg font-medium">{t("public.unavailableTitle")}</p>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="public.unavailableBody"
              t={t}
              components={{ 1: <strong /> }}
            />
          </p>
          <Link to="/" className="text-sm text-primary underline">
            {t("public.backHome")}
          </Link>
        </div>
      </div>
    );
  }

  const { tournament, groups, teams, matches } = q.data;
  const events = ((q.data as any).events ?? []) as any[];
  const eventsByMatch = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of events) {
      const arr = map.get(e.match_id) ?? [];
      arr.push(e);
      map.set(e.match_id, arr);
    }
    return map;
  }, [events]);
  const filteredMatches = useMemo(() => {
    if (teamFilter === "all") return matches;
    return (matches as any[]).filter(
      (m) => m.team_a_id === teamFilter || m.team_b_id === teamFilter,
    );
  }, [matches, teamFilter]);

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
    { id: "overview", label: t("public.tabs.overview"), icon: CalendarDays },
    { id: "teams", label: t("public.tabs.teams"), icon: Users },
    { id: "matches", label: t("public.tabs.matches"), icon: Calendar },
    { id: "standings", label: t("public.tabs.standings"), icon: ListOrdered },
    { id: "bracket", label: t("public.tabs.bracket"), icon: GitBranch },
  ];

  const accent = rules.branding.primaryColor;

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
          <div
            className="h-32 w-full"
            style={
              accent
                ? { background: `linear-gradient(135deg, ${accent}33, ${accent}11, transparent)` }
                : undefined
            }
          >
            {!accent && (
              <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/10 to-background" />
            )}
          </div>
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

        <div className="py-5 space-y-4">
          {(tab === "overview" || tab === "matches") && teams.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <label className="text-xs text-muted-foreground">Filtrer par équipe</label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="text-sm rounded-md border border-input bg-background px-2 py-1"
              >
                <option value="all">Toutes les équipes</option>
                {(teams as any[])
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {tab === "overview" && (
            <Overview
              groups={groups}
              teams={teams}
              matches={filteredMatches}
              scoring={scoring}
              eventsByMatch={eventsByMatch}
            />
          )}
          {tab === "teams" && <TeamsGrid teams={teams as any} />}
          {tab === "matches" && (
            <PublicMatches
              matches={filteredMatches as any}
              teams={teams as any}
              scoring={scoring}
              eventsByMatch={eventsByMatch}
            />
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

        <div className="pb-8">
          <SponsorsStrip
            sponsors={rules.branding.sponsors}
            title={rules.branding.sponsorsTitle || "Avec le soutien de nos partenaires"}
          />
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
  eventsByMatch,
}: {
  groups: any[];
  teams: any[];
  matches: any[];
  scoring: ScoringRules;
  eventsByMatch: Map<string, any[]>;
}) {
  const teamMap = new Map(teams.map((t: any) => [t.id, t]));
  const live = matches.filter((m: any) => m.status === "live");
  const upcoming = matches.filter((m: any) => m.status === "scheduled").slice(0, 5);
  const recent = matches.filter((m: any) => m.status === "completed").slice(-5).reverse();

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {live.length > 0 && (
        <div className="md:col-span-2">
          <Card title="En direct" empty="">
            {live.map((m: any) => (
              <MatchRow
                key={m.id}
                match={m}
                teamMap={teamMap}
                scoring={scoring}
                events={eventsByMatch.get(m.id) ?? []}
              />
            ))}
          </Card>
        </div>
      )}
      <Card title="Prochains matchs" empty="Aucun match programmé">
        {upcoming.map((m: any) => (
          <MatchRow
            key={m.id}
            match={m}
            teamMap={teamMap}
            scoring={scoring}
            events={eventsByMatch.get(m.id) ?? []}
          />
        ))}
      </Card>
      <Card title="Derniers résultats" empty="Aucun résultat pour le moment">
        {recent.map((m: any) => (
          <MatchRow
            key={m.id}
            match={m}
            teamMap={teamMap}
            scoring={scoring}
            events={eventsByMatch.get(m.id) ?? []}
          />
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

const EVENT_LABELS: Record<string, string> = {
  goal: "But",
  own_goal: "But CSC",
  assist: "Passe D.",
  yellow: "Carton jaune",
  red: "Carton rouge",
  second_yellow: "2e jaune",
  penalty: "Penalty",
  foul: "Faute",
};

const EVENT_EMOJI: Record<string, string> = {
  goal: "⚽",
  own_goal: "🥅",
  assist: "🅰️",
  yellow: "🟨",
  red: "🟥",
  second_yellow: "🟨🟥",
  penalty: "🎯",
  foul: "⚠️",
};

function EventsList({
  events,
  teamMap,
}: {
  events: any[];
  teamMap: Map<string, any>;
}) {
  if (!events || events.length === 0) return null;
  const sorted = [...events].sort((a, b) => {
    const ma = a.minute ?? 9999;
    const mb = b.minute ?? 9999;
    if (ma !== mb) return ma - mb;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
  return (
    <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
      {sorted.map((e) => {
        const team = e.team_id ? teamMap.get(e.team_id) : null;
        return (
          <li
            key={e.id}
            className="flex items-center gap-2 text-[11px] text-muted-foreground"
          >
            <span className="tabular-nums w-7 text-right">
              {e.minute != null ? `${e.minute}'` : "—"}
            </span>
            <span>{EVENT_EMOJI[e.kind] ?? "•"}</span>
            <span className="font-medium text-foreground">
              {EVENT_LABELS[e.kind] ?? e.kind}
            </span>
            {e.player_name && <span>· {e.player_name}</span>}
            {team && <span>· {team.short_name ?? team.name}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
      <Radio className="h-2.5 w-2.5 animate-pulse" />
      Live
    </span>
  );
}

function MatchRow({
  match,
  teamMap,
  scoring,
  events,
}: {
  match: any;
  teamMap: Map<string, any>;
  scoring: ScoringRules;
  events?: any[];
}) {
  const a = match.team_a_id ? teamMap.get(match.team_a_id) : null;
  const b = match.team_b_id ? teamMap.get(match.team_b_id) : null;
  const setsLine = scoring.mode === "sets" ? formatSets(match.sets) : "";
  const isLive = match.status === "live";
  return (
    <li className={cn("px-3 py-2 text-sm", isLive && "bg-red-500/5")}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="truncate text-right">{a?.name ?? "TBD"}</span>
        <span className="tabular-nums font-semibold flex items-center gap-1.5">
          {match.score_a ?? "–"} : {match.score_b ?? "–"}
          {isLive && <LiveBadge />}
        </span>
        <span className="truncate">{b?.name ?? "TBD"}</span>
      </div>
      {setsLine && (
        <div className="text-[11px] text-muted-foreground text-center mt-0.5 tabular-nums">
          {setsLine}
        </div>
      )}
      <EventsList events={events ?? []} teamMap={teamMap} />
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
  eventsByMatch,
}: {
  matches: any[];
  teams: any[];
  scoring: ScoringRules;
  eventsByMatch: Map<string, any[]>;
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
        const isLive = m.status === "live";
        const evts = eventsByMatch.get(m.id) ?? [];
        return (
          <li
            key={m.id}
            className={cn(
              "rounded-xl border border-border bg-card p-3",
              isLive && "border-red-500/40 bg-red-500/5",
            )}
          >
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <span className="truncate text-right text-sm font-medium">
                {teamMap.get(m.team_a_id)?.name ?? "TBD"}
              </span>
              <span className="tabular-nums font-bold flex items-center gap-1.5">
                {m.score_a ?? "–"} : {m.score_b ?? "–"}
                {isLive && <LiveBadge />}
              </span>
              <span className="truncate text-sm font-medium">
                {teamMap.get(m.team_b_id)?.name ?? "TBD"}
              </span>
            </div>
            {(m.scheduled_at || m.field) && (
              <div className="text-[11px] text-muted-foreground text-center mt-1">
                {m.scheduled_at && new Date(m.scheduled_at).toLocaleString("fr-FR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
                {m.scheduled_at && m.field ? " · " : ""}
                {m.field && `Terrain ${m.field}`}
              </div>
            )}
            {setsLine && (
              <div className="text-xs text-muted-foreground text-center mt-1 tabular-nums">
                {setsLine}
              </div>
            )}
            <EventsList events={evts} teamMap={teamMap} />
          </li>
        );
      })}
    </ul>
  );
}

