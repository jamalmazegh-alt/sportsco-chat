/**
 * Encadrement de l'événement — Lot 4a (refonte : liste unique).
 *
 * UNE seule carte, UNE seule liste dédupliquée par user_id :
 *  - staff de l'équipe (team_members role coach/assistant_coach)
 *  - + renforts du club (club_members coach) hors staff équipe
 *
 * Chaque ligne : nom · rôle · équipe · pastille de dispo, tag « Renfort »
 * si l'équipe de la personne ≠ équipe de l'événement.
 * Les assignés sont triés en premier.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  MinusCircle,
  UserPlus,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dispatchStaffAssignmentPush } from "@/lib/push-dispatch.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Status = "available" | "tentative" | "unavailable";

type Candidate = {
  user_id: string;
  full_name: string;
  role: string; // "coach" | "assistant_coach"
  teamName: string | null; // équipe de l'événement si staff, sinon équipe habituelle
  isReinforcement: boolean;
};

function formatName(p: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null | undefined) {
  if (!p) return "—";
  const built = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return built || p.full_name || "—";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function StaffAssignmentSection({
  eventId,
  teamId,
  clubId,
  eventDate,
}: {
  eventId: string;
  teamId: string;
  clubId: string;
  /** YYYY-MM-DD */
  eventDate: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pendingConflict, setPendingConflict] = useState<Candidate | null>(null);

  // ---- Data ----------------------------------------------------------------

  const { data: eventTeamName = null } = useQuery({
    queryKey: ["event-team-name", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .maybeSingle();
      return (data?.name as string | null) ?? null;
    },
  });

  const { data: teamStaff = [] } = useQuery({
    queryKey: ["event-staff-candidates", "team", teamId, eventTeamName],
    enabled: !!teamId,
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, role, profiles:user_id(first_name, last_name, full_name)")
        .eq("team_id", teamId)
        .in("role", ["coach", "assistant_coach"] as any);
      if (error) throw error;
      const seen = new Set<string>();
      return (data ?? [])
        .filter((r: any) => r.user_id && !seen.has(r.user_id) && (seen.add(r.user_id), true))
        .map((r: any) => ({
          user_id: r.user_id,
          full_name: formatName(r.profiles),
          role: r.role,
          teamName: eventTeamName,
          isReinforcement: false,
        }));
    },
  });

  const { data: reinforcements = [] } = useQuery({
    queryKey: ["event-staff-candidates", "club-reinforcements", clubId, teamId],
    enabled: !!clubId && !!teamId,
    queryFn: async (): Promise<Candidate[]> => {
      const teamStaffIds = new Set(teamStaff.map((c) => c.user_id));
      const { data, error } = await supabase
        .from("club_members")
        .select("user_id, role, roles, profiles:user_id(first_name, last_name, full_name)")
        .eq("club_id", clubId);
      if (error) throw error;
      const coachIds = (data ?? []).filter(
        (m: any) => m.role === "coach" || (Array.isArray(m.roles) && m.roles.includes("coach")),
      );
      const userIds = coachIds.map((m: any) => m.user_id).filter(Boolean);
      let usualByUser = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: tms } = await supabase
          .from("team_members")
          .select("user_id, role, teams:team_id(id, name, club_id, deleted_at)")
          .in("user_id", userIds)
          .in("role", ["coach", "assistant_coach"] as any);
        for (const r of (tms ?? []) as any[]) {
          if (r.teams?.club_id === clubId && !r.teams?.deleted_at && !usualByUser.has(r.user_id)) {
            usualByUser.set(r.user_id, r.teams.name);
          }
        }
      }
      return coachIds
        .filter((m: any) => m.user_id && !teamStaffIds.has(m.user_id))
        .map((m: any) => ({
          user_id: m.user_id,
          full_name: formatName(m.profiles),
          role: "coach",
          teamName: usualByUser.get(m.user_id) ?? null,
          isReinforcement: true,
        }));
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["event-staff-assignments", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_staff_assignments")
        .select("id, user_id, assigned_by, created_at")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: availabilityRows = [] } = useQuery({
    queryKey: ["event-staff-availability", teamId, clubId, eventDate],
    enabled: !!teamId && !!clubId && !!eventDate,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_staff_availabilities", {
        p_team_id: teamId,
        p_club_id: clubId,
        p_start: eventDate,
        p_end: eventDate,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const statusByUser = useMemo(() => {
    const map = new Map<string, Status>();
    for (const r of availabilityRows as any[]) {
      if (r.status !== "active") continue;
      if (r.start_date > eventDate || r.end_date < eventDate) continue;
      const prev = map.get(r.user_id);
      const next: Status = r.certainty === "confirmed" ? "unavailable" : "tentative";
      if (prev === "unavailable") continue;
      map.set(r.user_id, next);
    }
    return map;
  }, [availabilityRows, eventDate]);

  const assignedIds = useMemo(
    () => new Set(assignments.map((a) => a.user_id)),
    [assignments],
  );

  // Fusion dédupliquée par user_id, staff équipe prioritaire.
  const people = useMemo<Candidate[]>(() => {
    const map = new Map<string, Candidate>();
    for (const c of teamStaff) map.set(c.user_id, c);
    for (const c of reinforcements) if (!map.has(c.user_id)) map.set(c.user_id, c);
    const list = Array.from(map.values());
    list.sort((a, b) => {
      const aa = assignedIds.has(a.user_id) ? 0 : 1;
      const bb = assignedIds.has(b.user_id) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      // Puis staff équipe avant renforts
      if (a.isReinforcement !== b.isReinforcement) return a.isReinforcement ? 1 : -1;
      return a.full_name.localeCompare(b.full_name);
    });
    return list;
  }, [teamStaff, reinforcements, assignedIds]);

  // ---- Mutations -----------------------------------------------------------

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("event_staff_assignments")
        .insert({ event_id: eventId, user_id: userId, assigned_by: user?.id ?? null });
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      toast.success(t("staffAssignment.assigned", { defaultValue: "Coach assigné" }));
      qc.invalidateQueries({ queryKey: ["event-staff-assignments", eventId] });
      dispatchStaffAssignmentPush({
        data: { eventId, userId, action: "assigned" },
      }).catch((e) => console.warn("[staff] assign push failed", (e as Error).message));
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      if (msg.includes("row-level security") || msg.includes("check")) {
        toast.error(
          t("staffAssignment.notClubCoach", {
            defaultValue: "Ce coach n'appartient pas au club — assignation refusée.",
          }),
        );
      } else {
        toast.error(msg || t("common.error", { defaultValue: "Erreur" }));
      }
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("event_staff_assignments")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId);
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      toast.success(t("staffAssignment.removed", { defaultValue: "Coach retiré" }));
      qc.invalidateQueries({ queryKey: ["event-staff-assignments", eventId] });
      dispatchStaffAssignmentPush({
        data: { eventId, userId, action: "unassigned" },
      }).catch((e) => console.warn("[staff] unassign push failed", (e as Error).message));
    },
    onError: (e: any) => toast.error(String(e?.message ?? "Erreur")),
  });

  const requestAssign = (c: Candidate) => {
    const s = statusByUser.get(c.user_id);
    if (s === "unavailable" || s === "tentative") {
      setPendingConflict(c);
      return;
    }
    assignMutation.mutate(c.user_id);
  };

  // ---- Render --------------------------------------------------------------

  const renderRow = (c: Candidate) => {
    const status = statusByUser.get(c.user_id) ?? "available";
    const isAssigned = assignedIds.has(c.user_id);
    const roleLabel =
      c.role === "assistant_coach"
        ? t("teams.role.assistant_coach", { defaultValue: "Adjoint" })
        : t("teams.role.coach", { defaultValue: "Coach" });
    const meta = [roleLabel, c.teamName].filter(Boolean).join(" · ");
    return (
      <li key={c.user_id} className="py-2 flex items-center gap-3">
        <span className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold shrink-0">
          {initials(c.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            <span className="truncate">{c.full_name}</span>
            {c.isReinforcement && (
              <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0 text-[9px] font-medium uppercase text-primary shrink-0">
                {t("staffAssignment.reinforcement", { defaultValue: "Renfort" })}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{meta}</div>
        </div>
        <StatusDot status={status} />
        {isAssigned ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={unassignMutation.isPending}
            onClick={() => unassignMutation.mutate(c.user_id)}
          >
            <UserMinus className="h-3.5 w-3.5" />
            {t("staffAssignment.remove", { defaultValue: "Retirer" })}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 gap-1"
            disabled={assignMutation.isPending}
            onClick={() => requestAssign(c)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {t("staffAssignment.assign", { defaultValue: "Assigner" })}
          </Button>
        )}
      </li>
    );
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Users className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold">
            {t("staffAssignment.title", { defaultValue: "Encadrement" })}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("staffAssignment.hint", {
              defaultValue:
                "Assignez le staff de l'équipe ou un renfort du club pour cet événement.",
            })}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground">{people.length}</span>
      </div>

      {people.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("staffAssignment.noPeople", {
            defaultValue: "Aucun coach disponible pour cet événement.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-border">{people.map(renderRow)}</ul>
      )}

      <AlertDialog
        open={!!pendingConflict}
        onOpenChange={(open) => {
          if (!open) setPendingConflict(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("staffAssignment.conflict.title", {
                defaultValue: "Conflit de disponibilité",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("staffAssignment.conflict.body", {
                defaultValue:
                  "Ce coach présente un conflit sur ce créneau. Continuer ?",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", { defaultValue: "Annuler" })}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingConflict) assignMutation.mutate(pendingConflict.user_id);
                setPendingConflict(null);
              }}
            >
              {t("common.continue", { defaultValue: "Continuer" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function StatusDot({ status }: { status: Status }) {
  const { t } = useTranslation();
  const cls =
    status === "unavailable"
      ? "text-destructive"
      : status === "tentative"
      ? "text-amber-500"
      : "text-emerald-500";
  const Icon =
    status === "unavailable" ? MinusCircle : status === "tentative" ? CircleDashed : CheckCircle2;
  const label =
    status === "unavailable"
      ? t("staffAvailability.status.unavailable", { defaultValue: "Indisponible" })
      : status === "tentative"
      ? t("staffAvailability.status.tentative", { defaultValue: "Incertain" })
      : t("staffAvailability.status.available", { defaultValue: "Disponible" });
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", cls)} title={label}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}
