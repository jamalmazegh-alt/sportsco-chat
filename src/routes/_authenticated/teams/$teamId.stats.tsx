import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Trophy, Goal, BarChart3, Target, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TeamAttendanceStats } from "@/components/team-attendance-stats";
import { listChallenges, getChallengeRanking } from "@/lib/challenges/challenges.functions";
import { challengeDisplayName } from "@/lib/challenges/display";
import { toCsv, downloadCsv } from "@/lib/csv";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/teams/$teamId/stats")({
  component: TeamStatsPage,
  head: () => ({
    meta: [
      {
        title: i18n.t("stats.teamStats"),
      },
    ],
  }),
});

function TeamStatsPage() {
  const { teamId } = Route.useParams();
  const { t } = useTranslation();

  const { data: team } = useQuery({
    queryKey: ["team-basic", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, club_id")
        .eq("id", teamId)
        .single();
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 space-y-6">
      <div className="flex items-center gap-2">
        <Link
          to="/teams/$teamId"
          params={{ teamId }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold">
          {t("stats.teamStats")}
          {team?.name ? ` · ${team.name}` : ""}
        </h1>
      </div>

      <section className="space-y-3">
        <SectionTitle icon={<BarChart3 className="h-4 w-4" />}>
          {t("stats.attendanceSection")}
        </SectionTitle>
        <TeamAttendanceStats teamId={teamId} />
      </section>

      <section className="space-y-3">
        <SectionTitle icon={<Goal className="h-4 w-4" />}>{t("stats.matchesSection")}</SectionTitle>
        <TeamMatchStats teamId={teamId} />
      </section>

      <section className="space-y-3">
        <SectionTitle icon={<Trophy className="h-4 w-4" />}>
          {t("stats.challengesSection")}
        </SectionTitle>
        {team?.club_id && <TeamChallengesRankings clubId={team.club_id} teamId={teamId} />}
      </section>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {children}
    </h2>
  );
}

function TeamMatchStats({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["team-match-stats", teamId],
    queryFn: async () => {
      const { data: events } = await supabase
        .from("events")
        .select("id, is_home, opponent, starts_at")
        .eq("team_id", teamId)
        .eq("type", "match")
        .is("deleted_at", null);
      const eventIds = (events ?? []).map((e: any) => e.id);
      if (eventIds.length === 0) {
        return { totals: { W: 0, D: 0, L: 0, played: 0, gf: 0, ga: 0 }, scorers: [] as any[] };
      }

      const [{ data: results }, { data: goals }] = await Promise.all([
        supabase
          .from("match_results")
          .select("event_id, home_score, away_score")
          .in("event_id", eventIds),
        supabase
          .from("event_goals")
          .select("event_id, scorer_player_id, kind")
          .in("event_id", eventIds),
      ]);

      const evMap = new Map((events ?? []).map((e: any) => [e.id, e]));
      let W = 0,
        D = 0,
        L = 0,
        gf = 0,
        ga = 0;
      for (const r of results ?? []) {
        const ev: any = evMap.get(r.event_id);
        if (!ev) continue;
        const teamScore = ev.is_home ? r.home_score : r.away_score;
        const oppScore = ev.is_home ? r.away_score : r.home_score;
        if (teamScore == null || oppScore == null) continue;
        gf += teamScore;
        ga += oppScore;
        if (teamScore > oppScore) W++;
        else if (teamScore < oppScore) L++;
        else D++;
      }

      const scoreMap = new Map<string, number>();
      for (const g of goals ?? []) {
        if (g.kind === "own_goal" || !g.scorer_player_id) continue;
        scoreMap.set(g.scorer_player_id, (scoreMap.get(g.scorer_player_id) ?? 0) + 1);
      }
      const scorerIds = Array.from(scoreMap.keys());
      const { data: players } = scorerIds.length
        ? await supabase.from("players").select("id, first_name, last_name").in("id", scorerIds)
        : { data: [] as any[] };
      const pMap = new Map((players ?? []).map((p: any) => [p.id, p]));
      const scorers = Array.from(scoreMap.entries())
        .map(([id, count]) => ({ id, count, player: pMap.get(id) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totals: { W, D, L, played: W + D + L, gf, ga },
        scorers,
      };
    },
  });

  if (isLoading) return <LoaderRow />;
  if (!data) return null;
  const { totals, scorers } = data;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid grid-cols-3 gap-2 p-4 text-center">
          <StatBlock label={t("stats.resultWin")} value={totals.W} color="text-emerald-600" />
          <StatBlock label={t("stats.resultDraw")} value={totals.D} color="text-amber-600" />
          <StatBlock label={t("stats.resultLoss")} value={totals.L} color="text-rose-600" />
          <StatBlock label={t("stats.played")} value={totals.played} />
          <StatBlock label={t("stats.goalsFor")} value={totals.gf} />
          <StatBlock label={t("stats.goalsAgainst")} value={totals.ga} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4" /> {t("stats.topScorers")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-0">
          {scorers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("stats.noGoals")}</p>
          ) : (
            scorers.map((s, i) => (
              <Link
                key={s.id}
                to="/players/$playerId"
                params={{ playerId: s.id }}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <span className="w-6 text-center font-bold text-muted-foreground">#{i + 1}</span>
                <span className="flex-1 truncate underline underline-offset-2">
                  {s.player
                    ? `${s.player.first_name ?? ""} ${s.player.last_name ?? ""}`
                    : s.id.slice(0, 6)}
                </span>
                <span className="font-mono font-bold tabular-nums">{s.count}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

function TeamChallengesRankings({ clubId, teamId }: { clubId: string; teamId: string }) {
  const { t } = useTranslation();
  const list = useServerFn(listChallenges);
  const { data, isLoading } = useQuery({
    queryKey: ["challenges", clubId, teamId],
    queryFn: () => list({ data: { clubId, teamId } }),
  });
  if (isLoading) return <LoaderRow />;
  const challenges = data?.challenges ?? [];
  if (challenges.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          {t("stats.noChallenges")}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {challenges.map((c: any) => (
        <ChallengeRankingCard key={c.id} challenge={c} />
      ))}
    </div>
  );
}

function ChallengeRankingCard({ challenge }: { challenge: any }) {
  const { t } = useTranslation();
  const rank = useServerFn(getChallengeRanking);
  const { data, isLoading } = useQuery({
    queryKey: ["challenge-ranking", challenge.id],
    queryFn: () => rank({ data: { challengeId: challenge.id } }),
  });
  const ranking = data?.ranking ?? [];
  const top = useMemo(() => ranking.slice(0, 5), [ranking]);
  const displayName = challengeDisplayName(
    challenge,
    (k, o) => i18n.t(`challenges:${k}`, o) as string,
  );

  const handleExport = () => {
    const rows = ranking.map((row: any, i: number) => ({
      rank: i + 1,
      player: row.player
        ? `${row.player.first_name ?? ""} ${row.player.last_name ?? ""}`.trim()
        : row.player_id,
      score: row.score,
    }));
    const csv = toCsv(rows, [
      { key: "rank", header: "#" },
      { key: "player", header: t("stats.player") },
      { key: "score", header: t("stats.score") },
    ]);
    const safe = (displayName ?? "challenge").replace(/[^a-z0-9-_]+/gi, "_");
    downloadCsv(`ranking_${safe}.csv`, csv);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span>{challenge.icon ?? "🎯"}</span>
          <span className="flex-1 truncate">{displayName}</span>
          {ranking.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {isLoading ? (
          <LoaderRow />
        ) : top.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">{t("stats.noResults")}</p>
        ) : (
          top.map((row: any, i: number) => {
            const name = row.player
              ? `${row.player.first_name ?? ""} ${row.player.last_name ?? ""}`
              : row.player_id.slice(0, 6);
            const content = (
              <>
                <span className="w-6 text-center font-bold text-muted-foreground">#{i + 1}</span>
                <span className="flex-1 truncate underline underline-offset-2">{name}</span>
                <span className="font-mono font-bold tabular-nums">{row.score}</span>
              </>
            );
            return row.player_id ? (
              <Link
                key={row.player_id}
                to="/players/$playerId"
                params={{ playerId: row.player_id }}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                {content}
              </Link>
            ) : (
              <div key={i} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                {content}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function LoaderRow() {
  return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}
