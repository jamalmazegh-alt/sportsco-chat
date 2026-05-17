import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Trophy, Target, ShieldCheck } from "lucide-react";
import { PlayerAttendanceStats } from "@/components/player-attendance-stats";
import { TeamAttendanceStats } from "@/components/team-attendance-stats";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/stats")({
  component: StatsPage,
  head: () => ({ meta: [{ title: "Stats — Clubero" }] }),
});

function StatsPage() {
  const { t } = useTranslation();
  const { user, activeClubId } = useAuth();
  const role = useActiveRole();

  const isStaff = role === "admin" || role === "coach";

  return (
    <div className="container max-w-5xl py-4 pb-24 space-y-5">
      <header className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.stats")}</h1>
      </header>

      {!activeClubId ? (
        <p className="text-sm text-muted-foreground">{t("common.noClubSelected", { defaultValue: "Aucun club sélectionné" })}</p>
      ) : isStaff ? (
        <StaffStats clubId={activeClubId} isAdmin={role === "admin"} userId={user?.id ?? ""} />
      ) : (
        <PlayerOrParentStats clubId={activeClubId} userId={user?.id ?? ""} />
      )}
    </div>
  );
}

/* =================== Player / Parent =================== */

function PlayerOrParentStats({ clubId, userId }: { clubId: string; userId: string }) {
  const { t } = useTranslation();

  // Players visible: own + linked children
  const { data: players, isLoading } = useQuery({
    queryKey: ["stats-players", userId, clubId],
    enabled: !!userId && !!clubId,
    queryFn: async () => {
      const [ownRes, parentRes] = await Promise.all([
        supabase
          .from("players")
          .select("id, first_name, last_name")
          .eq("club_id", clubId)
          .eq("user_id", userId)
          .is("deleted_at", null),
        supabase
          .from("player_parents")
          .select("player_id, players:player_id(id, first_name, last_name, club_id, deleted_at)")
          .eq("parent_user_id", userId),
      ]);
      const own = (ownRes.data ?? []).map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, isOwn: true }));
      const children = (parentRes.data ?? [])
        .map((r: any) => r.players)
        .filter((p: any) => p && p.club_id === clubId && !p.deleted_at)
        .map((p: any) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, isOwn: false }));
      // dedupe by id
      const map = new Map<string, { id: string; name: string; isOwn: boolean }>();
      [...own, ...children].forEach((p) => map.set(p.id, p));
      return Array.from(map.values());
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && players && players.length > 0) setSelectedId(players[0].id);
  }, [players, selectedId]);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Chargement…" })}</p>;
  if (!players || players.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
        {t("stats.noPlayerLinked", { defaultValue: "Aucun joueur n'est lié à votre compte pour ce club." })}
      </div>
    );
  }

  const selected = players.find((p) => p.id === selectedId) ?? players[0];

  return (
    <div className="space-y-4">
      {players.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("stats.player", { defaultValue: "Joueur" })}</span>
          <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
            <SelectTrigger className="h-9 w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {players.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.isOwn ? "" : ` · ${t("stats.child", { defaultValue: "enfant" })}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <PlayerScoringSummary playerId={selected.id} />
      <PlayerAttendanceStats playerId={selected.id} />
    </div>
  );
}

function PlayerScoringSummary({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["player-scoring", playerId],
    queryFn: async () => {
      const [goalsRes, assistsRes, matchesRes] = await Promise.all([
        supabase
          .from("event_goals")
          .select("id, kind", { count: "exact", head: false })
          .eq("scorer_player_id", playerId),
        supabase
          .from("event_goals")
          .select("id", { count: "exact", head: true })
          .eq("assist_player_id", playerId),
        supabase
          .from("convocations")
          .select("id, status, events!inner(type, status)")
          .eq("player_id", playerId)
          .eq("status", "present"),
      ]);
      const goals = (goalsRes.data ?? []).filter((g: any) => g.kind !== "own_goal").length;
      const ownGoals = (goalsRes.data ?? []).filter((g: any) => g.kind === "own_goal").length;
      const assists = assistsRes.count ?? 0;
      const matchesPlayed = (matchesRes.data ?? []).filter(
        (c: any) => c.events?.type === "match" && c.events?.status !== "cancelled"
      ).length;
      return { goals, ownGoals, assists, matchesPlayed };
    },
  });

  const items = [
    { label: t("stats.matchesPlayed", { defaultValue: "Matchs joués" }), value: data?.matchesPlayed ?? 0, icon: ShieldCheck },
    { label: t("stats.goals", { defaultValue: "Buts" }), value: data?.goals ?? 0, icon: Target },
    { label: t("stats.assists", { defaultValue: "Passes décisives" }), value: data?.assists ?? 0, icon: Trophy },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {it.label}
            </div>
            <div className="mt-1 text-2xl font-bold">{it.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/* =================== Coach / Admin =================== */

function StaffStats({ clubId, isAdmin, userId }: { clubId: string; isAdmin: boolean; userId: string }) {
  const { t } = useTranslation();

  const { data: teams, isLoading } = useQuery({
    queryKey: ["stats-staff-teams", clubId, userId, isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const { data } = await supabase
          .from("teams")
          .select("id, name")
          .eq("club_id", clubId)
          .is("deleted_at", null)
          .order("name");
        return data ?? [];
      }
      // coach: teams they coach
      const { data } = await supabase
        .from("team_members")
        .select("team_id, teams:team_id(id, name, club_id, deleted_at)")
        .eq("user_id", userId)
        .in("role", ["coach", "admin"]);
      return (data ?? [])
        .map((r: any) => r.teams)
        .filter((tm: any) => tm && tm.club_id === clubId && !tm.deleted_at)
        .map((tm: any) => ({ id: tm.id, name: tm.name }));
    },
  });

  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    if (!teamId && teams && teams.length > 0) setTeamId(teams[0].id);
  }, [teams, teamId]);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Chargement…" })}</p>;
  if (!teams || teams.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
        {t("stats.noTeam", { defaultValue: "Aucune équipe disponible." })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("stats.team", { defaultValue: "Équipe" })}</span>
        <Select value={teamId ?? undefined} onValueChange={setTeamId}>
          <SelectTrigger className="h-9 w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {teams.map((tm) => (
              <SelectItem key={tm.id} value={tm.id}>{tm.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {teamId && (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">{t("stats.tabOverview", { defaultValue: "Vue d'ensemble" })}</TabsTrigger>
            <TabsTrigger value="players">{t("stats.tabPlayers", { defaultValue: "Joueurs" })}</TabsTrigger>
            <TabsTrigger value="attendance">{t("stats.tabAttendance", { defaultValue: "Présences" })}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <TeamMatchRecord teamId={teamId} />
          </TabsContent>
          <TabsContent value="players" className="mt-4">
            <TeamPlayersStats teamId={teamId} />
          </TabsContent>
          <TabsContent value="attendance" className="mt-4">
            <TeamAttendanceStats teamId={teamId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function getCurrentSeason() {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 7 ? y : y - 1; // season starts August
  const start = new Date(Date.UTC(startYear, 7, 1)).toISOString();
  const end = new Date(Date.UTC(startYear + 1, 7, 1)).toISOString();
  return { start, end, label: `${startYear}-${startYear + 1}` };
}

function TeamMatchRecord({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const season = useMemo(getCurrentSeason, []);
  const { data } = useQuery({
    queryKey: ["team-match-record", teamId, season.label],
    queryFn: async () => {
      const { data: matches } = await supabase
        .from("events")
        .select("id, is_home, status")
        .eq("team_id", teamId)
        .eq("type", "match")
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .gte("starts_at", season.start)
        .lt("starts_at", season.end);
      const matchIds = (matches ?? []).map((m) => m.id);
      const homeMap = new Map((matches ?? []).map((m: any) => [m.id, m.is_home]));
      if (matchIds.length === 0) return { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      const { data: results } = await supabase
        .from("match_results")
        .select("event_id, home_score, away_score")
        .in("event_id", matchIds);
      let w = 0, d = 0, l = 0, gf = 0, ga = 0, played = 0;
      (results ?? []).forEach((r: any) => {
        const isHome = homeMap.get(r.event_id);
        const our = isHome ? r.home_score : r.away_score;
        const opp = isHome ? r.away_score : r.home_score;
        gf += our; ga += opp; played++;
        if (our > opp) w++;
        else if (our < opp) l++;
        else d++;
      });
      return { played, w, d, l, gf, ga };
    },
  });

  const r = data ?? { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const diff = r.gf - r.ga;
  const winRate = r.played > 0 ? Math.round((r.w / r.played) * 100) : 0;

  const cards = [
    { label: t("stats.matchesWithResult", { defaultValue: "Matchs joués" }), value: r.played },
    { label: t("stats.wins", { defaultValue: "Victoires" }), value: r.w, tone: "text-emerald-600" },
    { label: t("stats.draws", { defaultValue: "Nuls" }), value: r.d, tone: "text-muted-foreground" },
    { label: t("stats.losses", { defaultValue: "Défaites" }), value: r.l, tone: "text-destructive" },
    { label: t("stats.goalsFor", { defaultValue: "Buts pour" }), value: r.gf },
    { label: t("stats.goalsAgainst", { defaultValue: "Buts contre" }), value: r.ga },
    { label: t("stats.goalDiff", { defaultValue: "Différence" }), value: `${diff > 0 ? "+" : ""}${diff}` },
    { label: t("stats.winRate", { defaultValue: "% Victoires" }), value: `${winRate}%` },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className={cn("mt-1 text-2xl font-bold", c.tone)}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

type PlayerRow = {
  player_id: string;
  name: string;
  matches: number;
  goals: number;
  assists: number;
  present: number;
  total: number;
};

type SortKey = "name" | "matches" | "goals" | "assists" | "attendance";

function TeamPlayersStats({ teamId }: { teamId: string }) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["team-players-stats", teamId],
    queryFn: async () => {
      // Roster
      const { data: roster } = await supabase
        .from("team_members")
        .select("player_id, players:player_id(id, first_name, last_name)")
        .eq("team_id", teamId)
        .eq("role", "player");
      const players = (roster ?? [])
        .map((r: any) => r.players)
        .filter(Boolean);
      const playerIds = players.map((p: any) => p.id);
      if (playerIds.length === 0) return [] as PlayerRow[];

      // Events of team (non-cancelled, not deleted)
      const { data: events } = await supabase
        .from("events")
        .select("id, type, status")
        .eq("team_id", teamId)
        .is("deleted_at", null)
        .neq("status", "cancelled");
      const eventIds = (events ?? []).map((e) => e.id);
      const matchEventIds = new Set((events ?? []).filter((e) => e.type === "match").map((e) => e.id));

      // Convocations for these events for our players
      const { data: convocs } = eventIds.length > 0
        ? await supabase
            .from("convocations")
            .select("player_id, status, event_id")
            .in("event_id", eventIds)
            .in("player_id", playerIds)
        : { data: [] as any[] };

      // Goals
      const { data: goals } = matchEventIds.size > 0
        ? await supabase
            .from("event_goals")
            .select("scorer_player_id, assist_player_id, kind, event_id")
            .in("event_id", Array.from(matchEventIds))
        : { data: [] as any[] };

      const rows: Record<string, PlayerRow> = {};
      players.forEach((p: any) => {
        rows[p.id] = {
          player_id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          matches: 0, goals: 0, assists: 0, present: 0, total: 0,
        };
      });

      (convocs ?? []).forEach((c: any) => {
        const r = rows[c.player_id];
        if (!r) return;
        r.total++;
        if (c.status === "present") {
          r.present++;
          if (matchEventIds.has(c.event_id)) r.matches++;
        }
      });
      (goals ?? []).forEach((g: any) => {
        if (g.kind !== "own_goal" && g.scorer_player_id && rows[g.scorer_player_id]) {
          rows[g.scorer_player_id].goals++;
        }
        if (g.assist_player_id && rows[g.assist_player_id]) {
          rows[g.assist_player_id].assists++;
        }
      });
      return Object.values(rows);
    },
  });

  const sorted = useMemo(() => {
    const list = [...(data ?? [])];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case "matches": av = a.matches; bv = b.matches; break;
        case "goals": av = a.goals; bv = b.goals; break;
        case "assists": av = a.assists; bv = b.assists; break;
        case "attendance":
          av = a.total > 0 ? a.present / a.total : 0;
          bv = b.total > 0 ? b.present / b.total : 0;
          break;
      }
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    return list;
  }, [data, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Chargement…" })}</p>;
  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
        {t("stats.noPlayersInTeam", { defaultValue: "Aucun joueur dans cette équipe." })}
      </div>
    );
  }

  const headers: Array<{ key: SortKey; label: string; align?: "right" }> = [
    { key: "name", label: t("stats.col.player", { defaultValue: "Joueur" }) },
    { key: "matches", label: t("stats.col.matches", { defaultValue: "Matchs" }), align: "right" },
    { key: "goals", label: t("stats.col.goals", { defaultValue: "Buts" }), align: "right" },
    { key: "assists", label: t("stats.col.assists", { defaultValue: "Passes" }), align: "right" },
    { key: "attendance", label: t("stats.col.attendance", { defaultValue: "% Présent" }), align: "right" },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th
                key={h.key}
                onClick={() => toggleSort(h.key)}
                className={cn(
                  "px-3 py-2 cursor-pointer select-none whitespace-nowrap",
                  h.align === "right" ? "text-right" : "text-left"
                )}
              >
                {h.label}
                {sortKey === h.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const pct = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
            return (
              <tr key={r.player_id} className="border-t">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right">{r.matches}</td>
                <td className="px-3 py-2 text-right">{r.goals}</td>
                <td className="px-3 py-2 text-right">{r.assists}</td>
                <td className="px-3 py-2 text-right">{r.total > 0 ? `${pct}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
