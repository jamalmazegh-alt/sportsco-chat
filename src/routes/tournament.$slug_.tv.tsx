/**
 * Diaporama TV — plein écran, rotation auto des écrans.
 * Slides : "Now playing", prochains matchs, derniers résultats, classement, bracket, sponsors.
 * Refresh live toutes les 30s. ?refresh=15 pour changer la durée d'un slide (en s).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";
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
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublicTournament } from "@/modules/tournaments/tournaments-public.functions";
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

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/tournament/${slug}`;
  }, [slug]);

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
    const live = (matches as any[]).filter((m: any) => m.status === "live");
    const upcoming = (matches as any[])
      .filter((m: any) => m.status === "scheduled")
      .slice(0, 6);
    const recent = (matches as any[])
      .filter((m: any) => m.status === "completed")
      .slice(-6)
      .reverse();
    const sortedGroups = [...(groups as any[])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const hasBracket = (matches as any[]).some((m: any) => m.round !== "group");

    const out: Slide[] = [];

    // Intro / hero
    out.push({
      key: "intro",
      title: tournament.name,
      icon: <Trophy className="h-7 w-7" />,
      render: () => (
        <IntroSlide tournament={tournament as any} qrUrl={publicUrl} />
      ),
    });

    // Live matches first when available
    if (live.length > 0) {
      out.push({
        key: "now",
        title: t("tv.slides.nowPlaying"),
        icon: <Radio className="h-7 w-7 text-red-500" />,
        render: () => (
          <MatchesGrid
            matches={live}
            teamMap={teamMap}
            scoring={scoring}
            xl
          />
        ),
      });
    }

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

    out.push({
      key: "results",
      title: t("tv.slides.recent"),
      icon: <Trophy className="h-7 w-7" />,
      render: () =>
        recent.length === 0 ? (
          <EmptyBig>{t("tv.slides.noRecent")}</EmptyBig>
        ) : (
          <MatchesGrid
            matches={recent}
            teamMap={teamMap}
            scoring={scoring}
            finished
          />
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

    return out;
  }, [data, scoring, t, publicUrl]);

  // Persistent sponsor footer (always visible if sponsors set)
  const footerSponsors = useMemo(() => {
    if (!data) return [];
    const rules = mergeRules((data.tournament as any).settings);
    return rules.branding.sponsors ?? [];
  }, [data]);

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

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % Math.max(1, slides.length));
      else if (e.key === "ArrowLeft")
        setIdx((i) => (i - 1 + slides.length) % Math.max(1, slides.length));
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key.toLowerCase() === "f") {
        if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
        else document.exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

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
      className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 text-foreground overflow-hidden flex flex-col"
    >
      <header className="border-b border-border/60 bg-card/80 backdrop-blur px-8 py-4 flex items-center gap-5">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          {slide?.icon ?? <Trophy className="h-7 w-7 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {data.tournament.name}
          </p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight truncate">
            {slide?.title ?? ""}
          </h1>
        </div>
        <div className="text-right tabular-nums shrink-0">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {clock.toLocaleDateString(i18n.language, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <p className="text-3xl md:text-4xl font-bold">
            {clock.toLocaleTimeString(i18n.language, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 md:p-10 relative">
        {/* Slide transitions: key on slide.key triggers re-mount + fade-in */}
        <div
          key={slide?.key ?? "empty"}
          className="h-full w-full animate-fade-in"
        >
          {slide?.render()}
        </div>
      </main>

      {/* Persistent sponsor strip */}
      {footerSponsors.length > 0 && (
        <div className="border-t border-border/60 bg-card/40 backdrop-blur px-6 py-2 flex items-center gap-6 overflow-hidden">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground shrink-0">
            {t("public.sponsorsTitleDefault")}
          </span>
          <div className="flex items-center gap-6 overflow-hidden">
            {footerSponsors.slice(0, 10).map((s) => (
              <img
                key={s.id}
                src={s.logo_url}
                alt={s.name}
                title={s.name}
                className="h-8 w-auto object-contain opacity-80"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      )}

      <footer className="border-t border-border/60 bg-card/80 backdrop-blur px-6 py-2 flex items-center justify-between gap-3">
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
                i === idx ? "w-10 bg-primary" : "w-2 bg-muted-foreground/30"
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
          className="gap-2"
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
    <div className="h-full flex items-center justify-center text-3xl text-muted-foreground">
      {children}
    </div>
  );
}

function IntroSlide({
  tournament,
  qrUrl,
}: {
  tournament: any;
  qrUrl: string;
}) {
  const { t } = useTranslation("tournaments");
  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 items-center">
      <div className="flex flex-col items-center md:items-start text-center md:text-left gap-5 min-w-0">
        {tournament.cover_image_url ? (
          <img
            src={tournament.cover_image_url}
            alt={tournament.name}
            className="max-h-[40vh] w-auto rounded-2xl object-cover shadow-2xl"
          />
        ) : (
          <div className="h-44 w-44 rounded-3xl bg-primary/10 flex items-center justify-center">
            <Trophy className="h-24 w-24 text-primary" />
          </div>
        )}
        <div className="space-y-2 max-w-3xl">
          <h2 className="text-6xl md:text-7xl font-black tracking-tight leading-none">
            {tournament.name}
          </h2>
          <p className="text-3xl text-muted-foreground">
            {tournament.sport}
            {tournament.location ? ` · ${tournament.location}` : ""}
          </p>
          <p className="text-xl text-muted-foreground">
            {tournament.starts_on}
            {tournament.ends_on ? ` → ${tournament.ends_on}` : ""}
          </p>
        </div>
      </div>
      {qrUrl && (
        <div className="hidden md:flex flex-col items-center gap-3 shrink-0">
          <div className="rounded-2xl bg-white p-5 shadow-2xl">
            <QRCodeCanvas value={qrUrl} size={220} level="M" />
          </div>
          <p className="text-base uppercase tracking-[0.18em] text-muted-foreground text-center max-w-[260px]">
            {t("tv.slides.scanForLive")}
          </p>
        </div>
      )}
    </div>
  );
}

function MatchesGrid({
  matches,
  teamMap,
  scoring,
  finished,
  xl,
}: {
  matches: any[];
  teamMap: Map<string, TvTeam>;
  scoring: ScoringRules;
  finished?: boolean;
  /** Use larger typography (Now playing). */
  xl?: boolean;
}) {
  const { t } = useTranslation("tournaments");
  const teamSize = xl ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl";
  const scoreSize = xl ? "text-6xl md:text-7xl" : "text-4xl md:text-5xl";
  return (
    <ul
      className={`h-full grid ${
        xl ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      } gap-4 auto-rows-fr content-start`}
    >
      {matches.map((m) => {
        const a = m.team_a_id ? teamMap.get(m.team_a_id) : null;
        const b = m.team_b_id ? teamMap.get(m.team_b_id) : null;
        const live = m.status === "live";
        const setsLine = scoring.mode === "sets" ? formatSets(m.sets) : "";
        const details: string[] = [];
        if (m.details?.went_to_aet || m.overtime_score_a != null)
          details.push(t("public.match.aet", { defaultValue: "AP" }));
        if (m.details?.penalties || m.details?.shootout)
          details.push(t("public.match.pen", { defaultValue: "TAB" }));
        const mvp = m.details?.mvp_name as string | undefined;
        return (
          <li
            key={m.id}
            className={`rounded-2xl border bg-card/80 backdrop-blur p-5 flex flex-col justify-between transition-all ${
              live
                ? "border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.15)]"
                : "border-border"
            }`}
          >
            <div className="flex items-center justify-between text-base font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                {m.field && (
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary font-bold">
                    {t("common.field")} {m.field}
                  </span>
                )}
                {m.scheduled_at && (
                  <span className="tabular-nums">
                    {new Date(m.scheduled_at).toLocaleString(i18n.language, {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {!m.field && !m.scheduled_at && "—"}
              </span>
              {live && (
                <span className="flex items-center gap-1.5 text-red-500 font-bold uppercase tracking-wider">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                  {t("common.live")}
                </span>
              )}
              {finished && !live && (
                <span className="text-emerald-600 font-semibold uppercase tracking-wider">
                  {t("common.ft")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 my-3">
              <span className={`text-right font-bold leading-tight break-words ${teamSize}`}>
                {a?.name ?? t("common.tbd")}
              </span>
              <span className={`tabular-nums font-black ${scoreSize}`}>
                {m.score_a ?? "–"} : {m.score_b ?? "–"}
              </span>
              <span className={`font-bold leading-tight break-words ${teamSize}`}>
                {b?.name ?? t("common.tbd")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                {details.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold text-xs uppercase tracking-wider"
                  >
                    {d}
                  </span>
                ))}
                {mvp && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-semibold text-xs uppercase tracking-wider">
                    MVP · {mvp}
                  </span>
                )}
              </div>
              {setsLine && (
                <span className="text-muted-foreground tabular-nums">
                  {setsLine}
                </span>
              )}
            </div>
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
  const { t } = useTranslation("tournaments");
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xl md:text-2xl">
        <thead className="text-sm uppercase tracking-wider text-muted-foreground border-b border-border">
          <tr>
            <th className="text-left px-3 py-3 w-12">{t("tv.table.rank")}</th>
            <th className="text-left px-3 py-3">{t("tv.table.team")}</th>
            <th className="text-right px-2 py-3 w-14">{t("tv.table.played")}</th>
            <th className="text-right px-2 py-3 w-14">{t("tv.table.won")}</th>
            <th className="text-right px-2 py-3 w-14">{t("tv.table.drawn")}</th>
            <th className="text-right px-2 py-3 w-14">{t("tv.table.lost")}</th>
            <th className="text-right px-2 py-3 w-20">{t("tv.table.diff")}</th>
            <th className="text-right px-3 py-3 w-16 font-bold">{t("tv.table.points")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const team = teamMap.get(r.teamId);
            const q = i < qualifiers;
            return (
              <tr
                key={r.teamId}
                className={`border-b border-border/60 ${q ? "bg-primary/10" : ""}`}
              >
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {q && (
                    <span className="inline-block w-1.5 h-6 align-middle mr-2 rounded-full bg-primary" />
                  )}
                  {i + 1}
                </td>
                <td className="px-3 py-2.5 font-bold truncate">
                  {team?.name ?? "—"}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.played}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.won}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.drawn}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.lost}</td>
                <td
                  className={`px-2 py-2.5 text-right tabular-nums ${
                    r.goalDiff > 0
                      ? "text-emerald-600"
                      : r.goalDiff < 0
                        ? "text-red-600"
                        : ""
                  }`}
                >
                  {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-black">
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
