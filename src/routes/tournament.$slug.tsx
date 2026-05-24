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
  Crown,
  Sparkles,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { getPublicTournament } from "@/modules/tournaments/tournaments-public.functions";
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

  const data = q.data;

  // Progressive disclosure: "published" stage = registration-focused page only.
  if (data.tournament.status === "published") {
    return <PublishedRegistrationView slug={slug} data={data} />;
  }

  const { tournament, groups, teams, matches } = data;
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

  const totalMatches = (matches as any[]).length;
  const playedMatches = (matches as any[]).filter((m: any) => m.status === "completed").length;
  const liveCount = (matches as any[]).filter((m: any) => m.status === "live").length;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const startMs = tournament.starts_on ? new Date(tournament.starts_on as any).setHours(0, 0, 0, 0) : null;
  const endMs = tournament.ends_on ? new Date(tournament.ends_on as any).setHours(0, 0, 0, 0) : null;
  const daysToStart =
    startMs !== null ? Math.round((startMs - todayMs) / 86_400_000) : null;
  const statusBadgeKey =
    tournament.status === "completed"
      ? "completedBadge"
      : tournament.status === "in_progress"
      ? "publishedBadge"
      : "publishedBadge";
  const heroSubline =
    tournament.status === "completed" && endMs
      ? t("public.hero.endedOn", { date: new Date(endMs).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" }) })
      : liveCount > 0
      ? t("public.hero.inProgress")
      : daysToStart != null && daysToStart > 0
      ? t("public.hero.startsIn", { count: daysToStart })
      : daysToStart === 0
      ? t("public.hero.today")
      : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Editorial hero — clean light surface, navy ink, blue accent */}
      <header className="relative overflow-hidden border-b border-border bg-gradient-to-b from-muted/50 via-background to-background">
        {tournament.cover_image_url && (
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07] bg-cover bg-center"
            style={{ backgroundImage: `url(${tournament.cover_image_url})` }}
          />
        )}
        <div
          aria-hidden
          className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl opacity-25"
          style={{ background: accent ?? "hsl(var(--primary))" }}
        />
        <div className="relative max-w-3xl mx-auto px-5 pt-10 pb-7">
          <div className="flex items-center gap-2 mb-5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={
                accent
                  ? { background: `${accent}1A`, color: accent }
                  : undefined
              }
            >
              <Sparkles className="h-3 w-3" />
              {t("public.hero.eyebrow")}
            </span>
            {tournament.status === "in_progress" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
                <Activity className="h-3 w-3" />
                {t(`public.hero.${statusBadgeKey}`)}
              </span>
            )}
            {tournament.status === "completed" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
                <Trophy className="h-3 w-3" />
                {t(`public.hero.completedBadge`)}
              </span>
            )}
          </div>
          <div className="flex items-start gap-5">
            <div
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl flex items-center justify-center shrink-0 ring-1 ring-border shadow-sm"
              style={
                accent
                  ? { background: `linear-gradient(135deg, ${accent}22, ${accent}05)`, color: accent }
                  : { background: "linear-gradient(135deg, hsl(var(--primary)/0.18), hsl(var(--primary)/0.04))", color: "hsl(var(--primary))" }
              }
            >
              <Trophy className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.05]">
                {tournament.name}
              </h1>
              {heroSubline && (
                <p className="text-sm text-muted-foreground mt-1.5 font-medium">
                  {heroSubline}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {tournament.starts_on}
                  {tournament.ends_on ? ` → ${tournament.ends_on}` : ""}
                </span>
                {tournament.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {tournament.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5" />
                  {tournament.sport}
                  {tournament.category ? ` · ${tournament.category}` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
            <HeroStat
              value={String((teams as any[]).length)}
              label={t("public.hero.teamsCount", { count: (teams as any[]).length })}
            />
            <HeroStat
              value={`${playedMatches}/${totalMatches || 0}`}
              label={t("public.hero.matchesPlayed", { played: playedMatches, total: totalMatches })}
              hideValue
            />
            <HeroStat
              value={String(liveCount)}
              label={t("public.hero.liveCount", { count: liveCount })}
              accent={liveCount > 0}
            />
          </div>

          {/* CTAs */}
          <div className="mt-5 flex flex-wrap gap-2">
            {registrationOpen && (
              <Button asChild size="sm" className="h-10 px-4">
                <Link to="/tournament/$slug/register" params={{ slug }}>
                  <UserPlus className="h-4 w-4" />
                  {t("public.register")}
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="h-10 px-4">
              <Link to="/tournament/$slug/tv" params={{ slug }}>
                <Tv className="h-4 w-4" />
                {t("public.tvSlideshow")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Confirmation banner shown right after programme publication */}
      {tournament.status === "in_progress" && (() => {
        const ppa = (tournament as any).published_programme_at;
        if (!ppa) return null;
        const ageMs = Date.now() - new Date(ppa).getTime();
        if (ageMs < 0 || ageMs > 3_600_000) return null;
        return (
          <div className="max-w-3xl mx-auto px-5 mt-4">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                ✅ {t("tournament.registrationConfirmed")}
              </p>
              <p className="text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
                {t("tournament.programmeComingSoon")}
              </p>
            </div>
          </div>
        );
      })()}

      <div className="max-w-3xl mx-auto px-5 mt-5">

        <nav className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b border-border -mx-5 px-5 py-2">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tabItem) => {
              const Icon = tabItem.icon;
              const active = tab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  onClick={() => setTab(tabItem.id)}
                  className={cn(
                    "min-w-fit flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tabItem.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="py-5 space-y-4">
          {(tab === "overview" || tab === "matches") && teams.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <label className="text-xs text-muted-foreground">
                {t("public.filterByTeam")}
              </label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="text-sm rounded-md border border-input bg-background px-2 py-1"
              >
                <option value="all">{t("public.allTeams")}</option>
                {(teams as any[])
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((teamOpt) => (
                    <option key={teamOpt.id} value={teamOpt.id}>
                      {teamOpt.name}
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
            title={
              rules.branding.sponsorsTitle || t("public.sponsorsTitleDefault")
            }
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
  const { t } = useTranslation("tournaments");
  const teamMap = new Map(teams.map((tm: any) => [tm.id, tm]));
  const live = matches.filter((m: any) => m.status === "live");
  const upcoming = matches.filter((m: any) => m.status === "scheduled").slice(0, 5);
  const recent = matches.filter((m: any) => m.status === "completed").slice(-5).reverse();

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {live.length > 0 && (
        <div className="md:col-span-2">
          <Card title={t("public.sections.nowPlaying")} empty="" accent>
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
      <Card
        title={t("public.sections.upcoming")}
        empty={t("public.sections.noUpcoming")}
      >
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
      <Card
        title={t("public.sections.recent")}
        empty={t("public.sections.noRecent")}
      >
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
      <Card title={t("public.sections.format")}>
        <p className="text-sm text-muted-foreground p-3">
          {t("public.sections.formatSummary", {
            count: groups.length,
            groupCount: groups.length,
            teamCount: teams.length,
            matchCount: matches.length,
          })}
        </p>
      </Card>
    </div>
  );
}

function Card({
  title,
  empty,
  children,
  accent,
}: {
  title: string;
  empty?: string;
  children?: React.ReactNode;
  accent?: boolean;
}) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section
      className={cn(
        "rounded-xl border bg-card overflow-hidden",
        accent ? "border-red-500/40 shadow-[0_0_0_3px_hsl(0_84%_60%/0.08)]" : "border-border",
      )}
    >
      <header
        className={cn(
          "px-3 py-2 border-b flex items-center gap-2",
          accent ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/40",
        )}
      >
        {accent && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
          </span>
        )}
        <h3 className={cn("font-medium text-sm", accent && "text-red-700 dark:text-red-400 uppercase tracking-wider text-xs font-bold")}>{title}</h3>
      </header>
      {hasContent ? (
        <ul className="divide-y divide-border">{children}</ul>
      ) : (
        <p className="px-3 py-4 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function useEventLabels(): Record<string, string> {
  const { t } = useTranslation("tournaments");
  return {
    goal: t("public.events.goal"),
    own_goal: t("public.events.own_goal"),
    assist: t("public.events.assist"),
    yellow: t("public.events.yellow"),
    red: t("public.events.red"),
    second_yellow: t("public.events.second_yellow"),
    penalty: t("public.events.penalty"),
    foul: t("public.events.foul"),
  };
}

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
  const EVENT_LABELS = useEventLabels();
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
  const { t } = useTranslation("tournaments");
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
      <Radio className="h-2.5 w-2.5 animate-pulse" />
      {t("common.live")}
    </span>
  );
}

function HeroStat({
  value,
  label,
  hideValue,
  accent,
}: {
  value: string;
  label: string;
  hideValue?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 backdrop-blur-sm px-3 py-2.5 flex flex-col justify-center min-h-[64px]",
        accent ? "border-red-500/40" : "border-border",
      )}
    >
      <p
        className={cn(
          "font-extrabold tabular-nums leading-none",
          hideValue ? "text-base sm:text-lg text-foreground" : "text-xl sm:text-2xl",
          accent && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mt-1">
        {label}
      </p>
    </div>
  );
}

function matchExtras(m: any) {
  const hasPen = m.penalty_score_a != null && m.penalty_score_b != null;
  const hasOt = m.overtime_score_a != null && m.overtime_score_b != null;
  const mvp = m?.details?.mvp_player_name as string | undefined;
  return { hasPen, hasOt, mvp };
}

function MatchBadges({ match }: { match: any }) {
  const { t } = useTranslation("tournaments");
  const { hasPen, hasOt, mvp } = matchExtras(match);
  if (!hasPen && !hasOt && !mvp) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 mt-1">
      {hasOt && (
        <span className="rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
          {t("common.aet")}
        </span>
      )}
      {hasPen && (
        <span className="rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide tabular-nums">
          {t("common.pen")} {match.penalty_score_a}-{match.penalty_score_b}
        </span>
      )}
      {mvp && (
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
          <Crown className="h-2.5 w-2.5" />
          {t("common.mvp")} · {mvp}
        </span>
      )}
    </div>
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
  const { t } = useTranslation("tournaments");
  const a = match.team_a_id ? teamMap.get(match.team_a_id) : null;
  const b = match.team_b_id ? teamMap.get(match.team_b_id) : null;
  const setsLine = scoring.mode === "sets" ? formatSets(match.sets) : "";
  const isLive = match.status === "live";
  const winnerA = match.winner_team_id && match.winner_team_id === match.team_a_id;
  const winnerB = match.winner_team_id && match.winner_team_id === match.team_b_id;
  return (
    <li className={cn("px-3 py-2 text-sm transition-colors", isLive && "bg-red-500/5 animate-pulse-ring")}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className={cn("truncate text-right inline-flex items-center justify-end gap-1.5", winnerA && "font-semibold text-foreground")}>
          {winnerA && <Crown className="h-3 w-3 text-amber-500" />}
          {a?.name ?? t("common.tbd")}
        </span>
        <span className="tabular-nums font-semibold flex items-center gap-1.5">
          <span className={cn(winnerA && "text-foreground", !winnerA && "text-muted-foreground")}>{match.score_a ?? "–"}</span>
          <span className="text-muted-foreground">:</span>
          <span className={cn(winnerB && "text-foreground", !winnerB && "text-muted-foreground")}>{match.score_b ?? "–"}</span>
          {isLive && <LiveBadge />}
        </span>
        <span className={cn("truncate inline-flex items-center gap-1.5", winnerB && "font-semibold text-foreground")}>
          {b?.name ?? t("common.tbd")}
          {winnerB && <Crown className="h-3 w-3 text-amber-500" />}
        </span>
      </div>
      <MatchBadges match={match} />
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
  const { t } = useTranslation("tournaments");
  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {t("public.sections.noTeams")}
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {teams.map((teamItem) => (
        <li
          key={teamItem.id}
          className="rounded-xl border border-border bg-card p-3 text-center"
        >
          <div className="h-12 w-12 mx-auto rounded-lg bg-muted overflow-hidden flex items-center justify-center mb-2">
            {teamItem.logo_url ? (
              <img
                src={teamItem.logo_url}
                alt={teamItem.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Users className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm font-medium truncate">{teamItem.name}</p>
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
  const { t } = useTranslation("tournaments");
  const teamMap = new Map(teams.map((tm) => [tm.id, tm]));
  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {t("public.sections.noMatches")}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const setsLine = scoring.mode === "sets" ? formatSets(m.sets) : "";
        const isLive = m.status === "live";
        const evts = eventsByMatch.get(m.id) ?? [];
        const winnerA = m.winner_team_id && m.winner_team_id === m.team_a_id;
        const winnerB = m.winner_team_id && m.winner_team_id === m.team_b_id;
        return (
          <li
            key={m.id}
            className={cn(
              "rounded-xl border bg-card p-3 transition-colors",
              isLive
                ? "border-red-500/40 bg-red-500/5"
                : m.status === "completed"
                ? "border-border"
                : "border-border hover:border-primary/30",
            )}
          >
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <span className={cn("truncate text-right text-sm inline-flex items-center justify-end gap-1.5", winnerA ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                {winnerA && <Crown className="h-3 w-3 text-amber-500" />}
                {teamMap.get(m.team_a_id)?.name ?? t("common.tbd")}
              </span>
              <span className="tabular-nums font-bold flex items-center gap-1.5">
                <span className={cn(!winnerA && "text-muted-foreground")}>{m.score_a ?? "–"}</span>
                <span className="text-muted-foreground">:</span>
                <span className={cn(!winnerB && "text-muted-foreground")}>{m.score_b ?? "–"}</span>
                {isLive && <LiveBadge />}
              </span>
              <span className={cn("truncate text-sm inline-flex items-center gap-1.5", winnerB ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                {teamMap.get(m.team_b_id)?.name ?? t("common.tbd")}
                {winnerB && <Crown className="h-3 w-3 text-amber-500" />}
              </span>
            </div>
            <MatchBadges match={m} />
            {(m.scheduled_at || m.field) && (
              <div className="text-[11px] text-muted-foreground text-center mt-1">
                {m.scheduled_at &&
                  new Date(m.scheduled_at).toLocaleString(i18n.language, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                {m.scheduled_at && m.field ? " · " : ""}
                {m.field && `${t("common.field")} ${m.field}`}
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

function PublishedRegistrationView({
  slug,
  data,
}: {
  slug: string;
  data: any;
}) {
  const { t } = useTranslation("tournaments");
  const { tournament, teams } = data;
  const rules = mergeRules(tournament.settings);
  const accent = rules.branding.primaryColor;

  const now = Date.now();
  const opens = rules.registration.opensAt ? new Date(rules.registration.opensAt).getTime() : null;
  const closes = rules.registration.closesAt ? new Date(rules.registration.closesAt).getTime() : null;
  const maxTeams = (tournament as any).num_teams ?? null;
  const teamsCount = (teams as any[]).length;
  const fee = Number((tournament as any).registration_fee ?? 0) || 0;
  const currency = ((tournament as any).registration_currency ?? "eur").toUpperCase();

  const reachedCap = maxTeams != null && teamsCount >= maxTeams;
  const closedByDate = closes !== null && now > closes;
  const notYetOpen = opens !== null && now < opens;
  const canRegister =
    rules.registration.enabled && !reachedCap && !closedByDate && !notYetOpen;

  const daysToClose =
    closes !== null && closes > now
      ? Math.ceil((closes - now) / 86_400_000)
      : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border bg-gradient-to-b from-muted/50 via-background to-background">
        {tournament.cover_image_url && (
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07] bg-cover bg-center"
            style={{ backgroundImage: `url(${tournament.cover_image_url})` }}
          />
        )}
        <div
          aria-hidden
          className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl opacity-25"
          style={{ background: accent ?? "hsl(var(--primary))" }}
        />
        <div className="relative max-w-3xl mx-auto px-5 pt-10 pb-7">
          <div className="flex items-start gap-5">
            <div
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl flex items-center justify-center shrink-0 ring-1 ring-border shadow-sm"
              style={
                accent
                  ? { background: `linear-gradient(135deg, ${accent}22, ${accent}05)`, color: accent }
                  : { background: "linear-gradient(135deg, hsl(var(--primary)/0.18), hsl(var(--primary)/0.04))", color: "hsl(var(--primary))" }
              }
            >
              <Trophy className="h-8 w-8 sm:h-10 sm:w-10" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.05]">
                {tournament.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {tournament.starts_on}
                  {tournament.ends_on ? ` → ${tournament.ends_on}` : ""}
                </span>
                {tournament.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {tournament.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5" />
                  {tournament.sport}
                  {tournament.format ? ` · ${tournament.format}` : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        {/* Registration banner */}
        <section
          className={cn(
            "rounded-2xl border p-5 space-y-3",
            canRegister
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-muted/30",
          )}
        >
          {reachedCap ? (
            <div className="space-y-1">
              <p className="text-base font-semibold">
                <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
                  {t("tournament.tournamentFull")}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t("tournament.teamsRegistered", { count: teamsCount, total: maxTeams })}
              </p>
            </div>
          ) : closedByDate ? (
            <div className="space-y-1">
              <p className="text-base font-semibold text-muted-foreground">
                {t("tournament.registrationClosed")}
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-base font-semibold">
                  {fee > 0
                    ? `${t("tournament.registrationFee")}: ${fee.toFixed(2)} ${currency}`
                    : t("tournament.freeRegistration")}
                </p>
                {maxTeams != null ? (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t("tournament.teamsRegistered", { count: teamsCount, total: maxTeams })}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t("tournament.teamsRegisteredNoMax", { count: teamsCount })}
                  </p>
                )}
              </div>
              {canRegister && (
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/tournament/$slug/register" params={{ slug }}>
                    <UserPlus className="h-4 w-4" />
                    {t("tournament.registerCta")}
                  </Link>
                </Button>
              )}
              {daysToClose != null && (
                <p className="text-xs text-muted-foreground">
                  {daysToClose === 0
                    ? t("tournament.closesToday")
                    : t("tournament.closesIn", { days: daysToClose })}
                </p>
              )}
            </>
          )}
        </section>

        {/* Tournament info */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t("tournament.tournamentInfo")}
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("public.tabs.standings", { defaultValue: "Format" })}</dt>
              <dd className="font-medium">{tournament.format}</dd>
            </div>
            {maxTeams != null && (
              <div>
                <dt className="text-xs text-muted-foreground">{t("create.numTeams", { defaultValue: "Équipes max" })}</dt>
                <dd className="font-medium">{maxTeams}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">{t("common.match", { defaultValue: "Sport" })}</dt>
              <dd className="font-medium">{tournament.sport}</dd>
            </div>
            {tournament.location && (
              <div>
                <dt className="text-xs text-muted-foreground">Lieu</dt>
                <dd className="font-medium">{tournament.location}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Public message from organizer (if set) */}
        {rules.registration.publicMessage && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t("tournament.rules")}
            </h2>
            <div className="whitespace-pre-wrap text-sm">
              {rules.registration.publicMessage}
            </div>
          </section>
        )}

        {/* Registered teams — names only */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {t("tournament.registeredTeams")}
          </h2>
          {teamsCount === 0 ? (
            <p className="text-sm text-muted-foreground">{t("tournament.beFirst")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {(teams as any[]).map((teamItem) => (
                <li
                  key={teamItem.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm"
                >
                  <Users className="h-3 w-3 text-muted-foreground" />
                  {teamItem.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <SponsorsStrip
          sponsors={rules.branding.sponsors}
          title={rules.branding.sponsorsTitle || t("public.sponsorsTitleDefault")}
        />
      </div>
    </div>
  );
}


