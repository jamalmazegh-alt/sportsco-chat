import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, CheckCircle2 } from "lucide-react";
import { UnavailableBadge, type UnavailableReason } from "@/components/unavailable-badge";
import { DeclareAbsenceDrawer } from "@/components/declare-absence-drawer";
import { toast } from "sonner";
import { BackLink } from "@/components/back-link";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/players/$playerId/availability")({
  component: AvailabilityPage,
});

type Row = {
  id: string;
  start_date: string;
  end_date: string;
  reason: UnavailableReason;
  status: "active" | "cancelled" | "completed";
  comment: string | null;
  created_by_user_id: string;
};

type Susp = {
  id: string;
  matches_to_serve: number;
  matches_served: number;
  status: string;
  suspension_reason: string;
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString();
}

function AvailabilityPage() {
  const { playerId } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const roles = useMyRoles();
  const isAdmin = roles.includes("admin");
  const canDeclare = roles.includes("player") || roles.includes("parent");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: canView, isLoading: accessLoading } = useQuery({
    queryKey: ["player-availability-access", playerId, user?.id],
    enabled: !!user && !!playerId,
    queryFn: async () => {
      const uid = user!.id;
      const { data: player } = await supabase
        .from("players")
        .select("user_id")
        .eq("id", playerId)
        .maybeSingle();
      if (player?.user_id === uid) return true;

      const { data: viaRpc, error: rpcErr } = await (supabase.rpc as any)("can_view_player_availability", {
        _user_id: uid,
        _player_id: playerId,
      });
      if (!rpcErr && viaRpc) return true;

      // Fallback until migration is deployed: same rules as RLS / can_view_player_availability.
      const [{ data: parentOk }, { data: coachOk }, { data: adminOk }] = await Promise.all([
        supabase.rpc("is_parent_of_player", { _user_id: uid, _player_id: playerId }),
        supabase.rpc("is_player_team_coach", { _user_id: uid, _player_id: playerId }),
        supabase.rpc("is_player_club_admin", { _user_id: uid, _player_id: playerId }),
      ]);
      return !!(parentOk || coachOk || adminOk);
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["player-availabilities", playerId],
    enabled: !!canView,
    queryFn: async (): Promise<Row[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("player_availabilities")
        .select("id, start_date, end_date, reason, status, comment, created_by_user_id")
        .eq("player_id", playerId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      // Lazy-compute expired→completed for UI
      return (data ?? []).map((r: any) => ({
        ...r,
        status: r.status === "active" && r.end_date < today ? "completed" : r.status,
      })) as Row[];
    },
  });

  const { data: suspensions = [] } = useQuery({
    queryKey: ["player-active-suspensions", playerId],
    enabled: !!canView,
    queryFn: async (): Promise<Susp[]> => {
      const { data } = await supabase
        .from("player_suspensions")
        .select("id, matches_to_serve, matches_served, status, suspension_reason")
        .eq("player_id", playerId)
        .eq("status", "active");
      return (data ?? []) as Susp[];
    },
  });

  async function cancel(row: Row) {
    if (!confirm(t("availability.confirmCancel", { defaultValue: "Annuler cette absence ?" }))) return;
    const { error } = await supabase
      .from("player_availabilities")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("availability.cancelled", { defaultValue: "Absence annulée" }));
    qc.invalidateQueries({ queryKey: ["player-availabilities", playerId] });
    qc.invalidateQueries({ queryKey: ["upcoming-absences"] });
    qc.invalidateQueries({ queryKey: ["event-absences"] });
    qc.invalidateQueries({ queryKey: ["team-active-absences"] });
  }

  const activeAbsences = rows.filter((r) => r.status === "active");
  const activeSusp = suspensions.filter(
    (s) => s.matches_to_serve - s.matches_served > 0,
  );

  useEffect(() => {
    if (!accessLoading && canView === false) {
      navigate({ to: "/home", replace: true });
    }
  }, [accessLoading, canView, navigate]);

  if (accessLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canView) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="space-y-4">
      <BackLink />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t("availability.title", { defaultValue: "Disponibilités" })}</h1>
        {canDeclare && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("availability.declare", { defaultValue: "Déclarer une absence" })}
          </Button>
        )}
      </div>

      {/* Consolidated view */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold">
          {t("availability.consolidated", { defaultValue: "Disponibilité actuelle" })}
        </h2>
        {activeAbsences.length === 0 && activeSusp.length === 0 ? (
          <p className="text-sm text-emerald-600 inline-flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            {t("availability.allAvailable", { defaultValue: "Aucune indisponibilité déclarée" })}
          </p>
        ) : (
          <ul className="space-y-2">
            {activeAbsences.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <UnavailableBadge reason={r.reason} detail={`${fmt(r.start_date)} → ${fmt(r.end_date)}`} size="md" />
              </li>
            ))}
            {activeSusp.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <UnavailableBadge
                  reason="suspension"
                  detail={t("discipline.matchesLeft", {
                    count: s.matches_to_serve - s.matches_served,
                  })}
                  size="md"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">{t("availability.history", { defaultValue: "Historique" })}</h2>
        </div>
        {isLoading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            {t("availability.empty", { defaultValue: "Aucune absence enregistrée." })}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const canCancel =
                r.status === "active" && (r.created_by_user_id === user?.id || isAdmin);
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <UnavailableBadge reason={r.reason} />
                      <span className="text-sm">
                        {fmt(r.start_date)} → {fmt(r.end_date)}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] rounded-full px-1.5 py-0.5 border",
                          r.status === "active"
                            ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                            : r.status === "cancelled"
                              ? "border-border text-muted-foreground bg-muted"
                              : "border-border text-muted-foreground bg-muted",
                        )}
                      >
                        {t(`availability.status.${r.status}`, { defaultValue: r.status })}
                      </span>
                    </div>
                    {r.comment && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{r.comment}</p>
                    )}
                  </div>
                  {canCancel && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(r)}>
                      {t("availability.cancel", { defaultValue: "Annuler" })}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DeclareAbsenceDrawer open={open} onOpenChange={setOpen} playerId={playerId} />
    </div>
  );
}
