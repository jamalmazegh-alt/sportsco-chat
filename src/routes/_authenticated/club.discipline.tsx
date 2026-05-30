import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ShieldAlert, Plus, ChevronLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickSanctionDrawer } from "@/components/quick-sanction-drawer";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/date-locale";

export const Route = createFileRoute("/_authenticated/club/discipline")({
  component: DisciplinePage,
  head: () => ({
    meta: [{ title: "Discipline — Clubero" }],
  }),
});

type Reason =
  | "red_card"
  | "accumulated_yellow_cards"
  | "federation_sanction"
  | "club_sanction"
  | "other";

type Row = {
  id: string;
  player_id: string;
  team_id: string;
  matches_to_serve: number;
  matches_served: number;
  suspension_start_date: string;
  suspension_reason: Reason;
  status: "active" | "completed" | "cancelled";
  created_at: string;
  player: { id: string; first_name: string; last_name: string } | null;
  team: { id: string; name: string } | null;
};

function DisciplinePage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const allowed =
    roles.includes("admin") || roles.includes("coach") || roles.includes("assistant_coach");
  const [tab, setTab] = useState<"active" | "history" | "stats">("active");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!activeClubId) return <Navigate to="/home" replace />;
  if (!allowed) return <Navigate to="/home" replace />;

  const { data: teams = [] } = useQuery({
    queryKey: ["club-teams", activeClubId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", activeClubId)
        .is("deleted_at", null)
        .order("name");
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["club-all-suspensions", activeClubId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("player_suspensions")
        .select(
          "id, player_id, team_id, matches_to_serve, matches_served, suspension_start_date, suspension_reason, status, created_at, players:player_id(id, first_name, last_name), teams:team_id(id, name)",
        )
        .eq("club_id", activeClubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        player: r.players,
        team: r.teams,
      })) as Row[];
    },
  });

  const filtered = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (teamFilter !== "all" && r.team_id !== teamFilter) return false;
      if (reasonFilter !== "all" && r.suspension_reason !== reasonFilter) return false;
      if (q && r.player) {
        const name = `${r.player.first_name} ${r.player.last_name}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [rows, teamFilter, reasonFilter, playerSearch]);

  const active = useMemo(
    () =>
      filtered
        .filter((r) => r.status === "active")
        .map((r) => ({ ...r, remaining: Math.max(0, r.matches_to_serve - r.matches_served) }))
        .sort((a, b) => a.remaining - b.remaining),
    [filtered],
  );

  const stats = useMemo(() => {
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const inSeason = rows.filter((r) => new Date(r.created_at) >= start);
    const reds = inSeason.filter((r) => r.suspension_reason === "red_card").length;
    const yellows = inSeason.filter((r) => r.suspension_reason === "accumulated_yellow_cards").length;
    const activeC = inSeason.filter((r) => r.status === "active").length;
    const completedC = inSeason.filter((r) => r.status === "completed").length;
    return { reds, yellows, activeC, completedC };
  }, [rows]);

  return (
    <div className="px-5 pt-6 pb-10 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link to="/home" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
          {t("common.back", { defaultValue: "Retour" })}
        </Link>
        <Button size="sm" onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("discipline.createSanction", { defaultValue: "Créer une sanction" })}
        </Button>
      </div>

      <header>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t("discipline.title", { defaultValue: "Discipline" })}</h1>
            <p className="text-xs text-muted-foreground">
              {t("discipline.subtitle", {
                defaultValue: "Vue globale des suspensions du club.",
              })}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t("discipline.allTeams", { defaultValue: "Toutes les équipes" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("discipline.allTeams", { defaultValue: "Toutes les équipes" })}
            </SelectItem>
            {teams.map((tm: any) => (
              <SelectItem key={tm.id} value={tm.id}>
                {tm.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("discipline.searchPlayer", { defaultValue: "Rechercher un joueur…" })}
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
          />
        </div>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t("suspension.reason")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("discipline.allReasons", { defaultValue: "Toutes raisons" })}</SelectItem>
            {(
              [
                "red_card",
                "accumulated_yellow_cards",
                "federation_sanction",
                "club_sanction",
                "other",
              ] as Reason[]
            ).map((r) => (
              <SelectItem key={r} value={r}>
                {t(`suspension.reason_${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="w-full">
          <TabsTrigger value="active" className="flex-1">
            {t("discipline.active", { defaultValue: "Actives" })}
            {active.length > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive/10 text-destructive text-[10px] px-1.5 py-0.5 font-semibold">
                {active.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            {t("discipline.history", { defaultValue: "Historique" })}
          </TabsTrigger>
          <TabsTrigger value="stats" className="flex-1">
            {t("discipline.stats", { defaultValue: "Stats" })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : active.length === 0 ? (
            <EmptyState
              message={t("discipline.noneInClub", {
                defaultValue: "✅ Aucune suspension active dans le club.",
              })}
            />
          ) : (
            <SuspensionTable rows={active} t={t} showRemaining />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState
              message={t("discipline.historyEmpty", { defaultValue: "Aucun résultat." })}
            />
          ) : (
            <SuspensionTable rows={filtered as any} t={t} showStatus />
          )}
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label={t("discipline.kpi.yellows", { defaultValue: "Cartons jaunes" })} value={stats.yellows} />
            <Kpi label={t("discipline.kpi.reds", { defaultValue: "Cartons rouges" })} value={stats.reds} tone="destructive" />
            <Kpi label={t("discipline.kpi.active", { defaultValue: "Actives" })} value={stats.activeC} tone="amber" />
            <Kpi label={t("discipline.kpi.completed", { defaultValue: "Purgées" })} value={stats.completedC} tone="emerald" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("discipline.kpi.windowHint", { defaultValue: "Sur les 12 derniers mois." })}
          </p>
        </TabsContent>
      </Tabs>

      <QuickSanctionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        clubId={activeClubId}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "destructive" | "amber" | "emerald";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p
        className={cn(
          "text-2xl font-bold leading-none",
          tone === "destructive" && "text-destructive",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function SuspensionTable({
  rows,
  t,
  showRemaining,
  showStatus,
}: {
  rows: Array<Row & { remaining?: number }>;
  t: (key: string, opts?: any) => string;
  showRemaining?: boolean;
  showStatus?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium">
              {t("discipline.col.player", { defaultValue: "Joueur" })}
            </th>
            <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">
              {t("discipline.col.team", { defaultValue: "Équipe" })}
            </th>
            <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
              {t("suspension.reason")}
            </th>
            <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
              {t("suspension.startDate")}
            </th>
            <th className="text-right px-3 py-2 font-medium">
              {showRemaining
                ? t("discipline.col.remaining", { defaultValue: "Restants" })
                : t("discipline.col.status", { defaultValue: "Statut" })}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-t border-border/60 hover:bg-muted/30 cursor-pointer"
              onClick={() => {
                if (r.player) window.location.href = `/players/${r.player.id}`;
              }}
            >
              <td className="px-3 py-2 font-medium">
                {r.player ? `${r.player.first_name} ${r.player.last_name}` : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                {r.team?.name ?? "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                {t(`suspension.reason_${r.suspension_reason}`)}
              </td>
              <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                {fmt(new Date(r.suspension_start_date), "d MMM yyyy")}
              </td>
              <td className="px-3 py-2 text-right">
                {showRemaining ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      (r.remaining ?? 0) === 1
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {r.remaining}
                  </span>
                ) : (
                  <StatusPill status={r.status} t={t} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: Row["status"];
  t: (key: string, opts?: any) => string;
}) {
  const map: Record<Row["status"], { label: string; cls: string }> = {
    active: {
      label: t("discipline.statusActive", { defaultValue: "Active" }),
      cls: "bg-destructive/10 text-destructive",
    },
    completed: {
      label: t("suspension.completed"),
      cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    cancelled: {
      label: t("suspension.cancelled"),
      cls: "bg-muted text-muted-foreground",
    },
  };
  const m = map[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", m.cls)}>
      {m.label}
    </span>
  );
}
