import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ShieldAlert, Plus, CheckCircle2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { QuickSanctionDrawer } from "@/components/quick-sanction-drawer";
import { cn } from "@/lib/utils";

interface Props {
  clubId: string;
  className?: string;
}

type ActiveRow = {
  id: string;
  player_id: string;
  team_id: string;
  matches_to_serve: number;
  matches_served: number;
  remaining: number;
  player: { id: string; first_name: string; last_name: string } | null;
  team: { id: string; name: string } | null;
};

export function DisciplineWidget({ clubId, className }: Props) {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["club-active-suspensions", clubId],
    enabled: !!clubId,
    queryFn: async (): Promise<ActiveRow[]> => {
      const { data, error } = await supabase
        .from("player_suspensions")
        .select(
          "id, player_id, team_id, matches_to_serve, matches_served, status, players:player_id(id, first_name, last_name), teams:team_id(id, name)",
        )
        .eq("club_id", clubId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => ({
          id: r.id,
          player_id: r.player_id,
          team_id: r.team_id,
          matches_to_serve: r.matches_to_serve,
          matches_served: r.matches_served,
          remaining: Math.max(0, r.matches_to_serve - r.matches_served),
          player: r.players,
          team: r.teams,
        }))
        .sort((a, b) => a.remaining - b.remaining);
    },
    staleTime: 30_000,
  });

  const total = rows.length;
  const top = rows.slice(0, 3);

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center",
              total > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600",
            )}
          >
            {total > 0 ? (
              <ShieldAlert className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
          </div>
          <h2 className="text-sm font-semibold">
            {isLoading
              ? t("discipline.title", { defaultValue: "Discipline" })
              : total > 0
                ? t("discipline.activeCount", {
                    defaultValue: "{{count}} suspension active",
                    count: total,
                  })
                : t("discipline.none", { defaultValue: "Aucune suspension active" })}
          </h2>
        </div>
        <Link
          to="/club/discipline"
          className="text-xs text-primary font-medium inline-flex items-center gap-0.5"
        >
          {t("discipline.viewAll", { defaultValue: "Voir tout" })}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {total > 0 && (
        <ul className="mt-3 space-y-1.5">
          {top.map((r) => {
            const name = r.player
              ? `${r.player.first_name} ${r.player.last_name.charAt(0)}.`
              : "—";
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.team?.name ?? "—"}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[11px] font-semibold rounded-full px-2 py-0.5",
                    r.remaining === 1
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {t("discipline.matchesLeft", {
                    defaultValue: "{{count}} match restant",
                    defaultValue_plural: "{{count}} matchs restants",
                    count: r.remaining,
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button asChild size="sm" variant="outline" className="flex-1">
          <Link to="/club/discipline">
            {t("discipline.viewAll", { defaultValue: "Voir tout" })}
          </Link>
        </Button>
        <Button size="sm" className="flex-1" onClick={() => setDrawerOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("discipline.createSanction", { defaultValue: "Créer une sanction" })}
        </Button>
      </div>

      <QuickSanctionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        clubId={clubId}
      />
    </section>
  );
}
