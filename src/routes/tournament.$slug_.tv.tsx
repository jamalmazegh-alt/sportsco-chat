/**
 * Diaporama TV — plein écran, rotation auto des écrans.
 * Slides : prochains matchs, derniers résultats, classement par poule, bracket.
 * Refresh live toutes les 30s. ?refresh=15 pour changer la durée d'un slide (en s).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  Trophy,
  Calendar,
  Loader2,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  ListOrdered,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublicTournament } from "@/modules/tournaments/tournaments.functions";
import { computeStandings } from "@/modules/tournaments/lib/standings";
import { BracketView } from "@/modules/tournaments/components/BracketView";
import { SponsorsStrip } from "@/modules/tournaments/components/SponsorsStrip";
import { mergeRules } from "@/modules/tournaments/lib/rules";
import {
  resolveScoring,
  formatSets,
  type ScoringRules,
} from "@/modules/tournaments/lib/formats";

type TvTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  group_id: string | null;
};

export const Route = createFileRoute("/tournament/$slug_/tv")({
  component: TvSlideshowPage,
  validateSearch: (search: Record<string, unknown>) => ({
    refresh:
      typeof search.refresh === "string" || typeof search.refresh === "number"
        ? Math.min(120, Math.max(5, Number(search.refresh) || 12))
        : 12,
  }),
  head: ({ params }) => ({
    meta: [
      {
        title: i18n.t("tv.metaTitle", { ns: "tournaments", slug: params.slug }),
      },
    ],
  }),
});

function TvSlideshowPage() {
  const { slug } = Route.useParams();
  const { refresh } = Route.useSearch();
  const { t } = useTranslation("tournaments");
  const fn = useServerFn(getPublicTournament);
  const q = useQuery({
    queryKey: ["public-tournament-tv", slug],
    queryFn: () => fn({ data: { slug } }),
    refetchInterval: 30_000,
  });

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Horloge
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fullscreen state
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const data = q.data;
  const scoring = useMemo(
    () =>
      resolveScoring(
        (data?.tournament as any)?.sport,
        (data?.tournament as any)?.settings?.scoring,
      ),
    [data?.tournament],
  );

  const slides = useMemo(() => {
    if (!data) return [] as Slide[];
    const { tournament, groups, teams, matches } = data;
    const rules = mergeRules((tournament as any).settings);
    const sponsors = rules.branding.sponsors ?? [];
    const sponsorsTitle =
      rules.branding.sponsorsTitle || t("public.sponsorsTitleDefault");
    const teamMap = new Map<string, TvTeam>(
      teams.map((t: any) => [t.id, t as TvTeam]),
    );
    const upcoming = (matches as any[])
      .filter((m: any) => m.status === "scheduled" || m.status === "live")
      .slice(0, 8);
    const recent = (matches as any[])
      .filter((m: any) => m.status === "completed")
      .slice(-8)
      .reverse();
    const sortedGroups = [...(groups as any[])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const hasBracket = (matches as any[]).some((m: any) => m.round !== "group");

    const out: Slide[] = [];
    out.push({
      key: "results",
      title: t("tv.slides.recent"),
      icon: <Trophy className="h-7 w-7" />,
      render: () =>
        recent.length === 0 ? (
          <EmptyBig>{t("tv.slides.noRecent")}</EmptyBig>
        ) : (
          <MatchesGrid matches={recent} teamMap={teamMap} scoring={scoring} finished />
        ),
    });
    out.push({
      key: "upcoming",
      title: t("tv.slides.upcoming"),
      icon: <Calendar className="h-7 w-7" />,
      render: () =>
        upcoming.length === 0 ? (
          <EmptyBig>{t("tv.slides.noUpcoming")}</EmptyBig>
        ) : (
          <MatchesGrid matches={upcoming} teamMap={teamMap} scoring={scoring} />
        ),
    });
    if (sortedGroups.length > 0) {
      for (const g of sortedGroups) {
        const ids = (teams as any[])
          .filter((t: any) => t.group_id === g.id)
          .map((t: any) => t.id);
        const gMatches = (matches as any[])
          .filter((m: any) => m.round === "group" && m.group_id === g.id)
          .map((m: any) => ({
            teamAId: m.team_a_id,
            teamBId: m.team_b_id,
            scoreA: m.score_a,
            scoreB: m.score_b,
            status: m.status,
          }));
        const rows = computeStandings(ids, gMatches);
        out.push({
          key: `standings-${g.id}`,
          title: t("tv.slides.standings", { group: g.name }),
          icon: <ListOrdered className="h-7 w-7" />,
          render: () => (
            <StandingsTable
              rows={rows}
              teamMap={teamMap}
              qualifiers={g.qualifiers_count}
            />
          ),
        });
      }
    }
    if (hasBracket) {
      out.push({
        key: "bracket",
        title: t("tv.slides.bracket"),
        icon: <GitBranch className="h-7 w-7" />,
        render: () => (
          <div className="h-full w-full overflow-auto px-2">
            <BracketView matches={matches as any} teams={teams as any} />
          </div>
        ),
      });
    }
    if (sponsors.length > 0) {
      out.push({
        key: "sponsors",
        title: sponsorsTitle,
        icon: <Trophy className="h-7 w-7" />,
        render: () => (
          <div className="h-full flex items-center justify-center">
            <div className="w-full max-w-6xl">
              <SponsorsStrip sponsors={sponsors} title={sponsorsTitle} />
            </div>
          </div>
        ),
      });
    }

    // Always close on tournament title
    out.unshift({
      key: "intro",
      title: tournament.name,
      icon: <Trophy className="h-7 w-7" />,
      render: () => (
        <div className="h-full flex flex-col items-center justify-center text-center gap-4">
          {tournament.cover_image_url ? (
            <img
              src={tournament.cover_image_url}
              alt={tournament.name}
              className="max-h-[50vh] w-auto rounded-2xl object-cover shadow-2xl"
            />
          ) : (
            <div className="h-40 w-40 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Trophy className="h-20 w-20 text-primary" />
            </div>
          )}
          <div className="space-y-1">
            <h2 className="text-6xl font-black tracking-tight">{tournament.name}</h2>
            <p className="text-2xl text-muted-foreground">
              {tournament.sport}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
            <p className="text-lg text-muted-foreground">
              {tournament.starts_on}
              {tournament.ends_on ? ` → ${tournament.ends_on}` : ""}
            </p>
          </div>
        </div>
      ),
    });
    return out;
  }, [data, scoring, t]);

  // Auto-rotation
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const ms = refresh * 1000;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % slides.length),
      ms,
    );
    return () => clearInterval(id);
  }, [paused, slides.length, refresh]);

  // Reset index if slides shrink
  useEffect(() => {
    if (idx >= slides.length && slides.length > 0) setIdx(0);
  }, [idx, slides.length]);

  if (q.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // Draft / archived / unknown tournament: getPublicTournament returns null.
  // Don't expose any internal state — just show a neutral "not available" screen.
  if (!data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Trophy className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{t("tv.unavailableTitle")}</h1>
        <p className="text-muted-foreground max-w-md">{t("tv.unavailableBody")}</p>
      </div>
    );
  }


  const slide = slides[idx];

  const goFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background text-foreground overflow-hidden flex flex-col"
    >
      <header className="border-b border-border bg-card px-8 py-4 flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          {slide?.icon ?? <Trophy className="h-6 w-6 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {data.tournament.name}
          </p>
          <h1 className="text-2xl font-bold truncate">{slide?.title ?? ""}</h1>
        </div>
        <div className="text-right tabular-nums">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {clock.toLocaleDateString(i18n.language, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <p className="text-2xl font-semibold">
            {clock.toLocaleTimeString(i18n.language, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-8">
        <div className="h-full w-full">{slide?.render()}</div>
      </main>

      <footer className="border-t border-border bg-card/60 px-6 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() =>
              setIdx((i) => (i - 1 + slides.length) % slides.length)
            }
            aria-label={t("tv.controls.previous")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? t("tv.controls.resume") : t("tv.controls.pause")}
          >
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIdx((i) => (i + 1) % slides.length)}
            aria-label={t("tv.controls.next")}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIdx(i)}
              aria-label={s.title}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={goFullscreen}
          aria-label={
            isFs ? t("tv.controls.exitFullscreen") : t("tv.controls.fullscreen")
          }
        >
          {isFs ? (
            <>
              <Minimize2 className="h-4 w-4" />
              {t("tv.controls.exit")}
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4" />
              {t("tv.controls.fullscreen")}
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}

type Slide = {
  key: string;
  title: string;
  icon: ReactNode;
  render: () => ReactNode;
};

function EmptyBig({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center text-2xl text-muted-foreground">
      {children}
    </div>
  );
}

function MatchesGrid({
  matches,
  teamMap,
  scoring,
  finished,
}: {
  matches: any[];
  teamMap: Map<string, TvTeam>;
  scoring: ScoringRules;
  finished?: boolean;
}) {
  return (
    <ul className="h-full grid grid-cols-1 md:grid-cols-2 gap-3 auto-rows-fr content-start">
      {matches.map((m) => {
        const a = m.team_a_id ? teamMap.get(m.team_a_id) : null;
        const b = m.team_b_id ? teamMap.get(m.team_b_id) : null;
        const live = m.status === "live";
        const setsLine = scoring.mode === "sets" ? formatSets(m.sets) : "";
        return (
          <li
            key={m.id}
            className="rounded-2xl border border-border bg-card p-4 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {m.scheduled_at
                  ? new Date(m.scheduled_at).toLocaleString("fr-FR", {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
                {m.field ? ` · ${m.field}` : ""}
              </span>
              {live && (
                <span className="flex items-center gap-1 text-red-600 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                  LIVE
                </span>
              )}
              {finished && !live && (
                <span className="text-emerald-600 font-semibold">FT</span>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 my-2">
              <span className="truncate text-right text-2xl font-semibold">
                {a?.name ?? "TBD"}
              </span>
              <span className="tabular-nums font-black text-4xl">
                {m.score_a ?? "–"} : {m.score_b ?? "–"}
              </span>
              <span className="truncate text-2xl font-semibold">
                {b?.name ?? "TBD"}
              </span>
            </div>
            {setsLine && (
              <div className="text-sm text-muted-foreground text-center tabular-nums">
                {setsLine}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StandingsTable({
  rows,
  teamMap,
  qualifiers,
}: {
  rows: ReturnType<typeof computeStandings>;
  teamMap: Map<string, TvTeam>;
  qualifiers: number;
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-lg">
        <thead className="text-xs uppercase text-muted-foreground border-b border-border">
          <tr>
            <th className="text-left px-3 py-2 w-10">#</th>
            <th className="text-left px-3 py-2">Équipe</th>
            <th className="text-right px-2 py-2 w-12">J</th>
            <th className="text-right px-2 py-2 w-12">G</th>
            <th className="text-right px-2 py-2 w-12">N</th>
            <th className="text-right px-2 py-2 w-12">P</th>
            <th className="text-right px-2 py-2 w-16">+/-</th>
            <th className="text-right px-3 py-2 w-14 font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const t = teamMap.get(r.teamId);
            const q = i < qualifiers;
            return (
              <tr
                key={r.teamId}
                className={`border-b border-border/60 ${q ? "bg-primary/5" : ""}`}
              >
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {i + 1}
                </td>
                <td className="px-3 py-2 font-semibold truncate">
                  {t?.name ?? "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{r.played}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.won}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.drawn}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.lost}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-black">
                  {r.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
