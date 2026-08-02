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
import { getPublicOrigin } from "@/lib/native-platform";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronsUpDown,
  CircleDashed,
  MinusCircle,
  Plus,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dispatchStaffAssignmentPush } from "@/lib/push-dispatch.functions";
import { dispatchStaffAssignmentEmail } from "@/lib/staff-assignment-notify.functions";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { StaffCoverageBadge } from "@/components/staff-coverage-badge";

type Status = "available" | "tentative" | "unavailable";

type Candidate = {
  user_id: string;
  full_name: string;
  role: string; // "coach" | "assistant_coach"
  teamName: string | null; // équipe de l'événement si staff, sinon équipe habituelle
  isReinforcement: boolean;
};

function formatName(
  p:
    | { first_name?: string | null; last_name?: string | null; full_name?: string | null }
    | null
    | undefined,
) {
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

  // Unified pool via SECURITY DEFINER RPC — bypasses can_view_team so admins /
  // event staff can see reinforcements from other teams of the club. RPC
  // enforces its own access guard (event team staff OR club admin/dirigeant).
  const { data: pool = [] } = useQuery({
    queryKey: ["event-assignable-staff", eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await supabase.rpc("get_assignable_staff", {
        p_event_id: eventId,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        full_name: r.full_name ?? "—",
        role: r.role,
        teamName: r.usual_team_name ?? null,
        isReinforcement: !r.is_event_team_staff,
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

  const absenceByUser = useMemo(() => {
    const map = new Map<string, { status: Status; start: string; end: string }>();
    for (const r of availabilityRows as any[]) {
      if (r.status !== "active") continue;
      if (r.start_date > eventDate || r.end_date < eventDate) continue;
      const next: Status = r.certainty === "confirmed" ? "unavailable" : "tentative";
      const prev = map.get(r.user_id);
      if (prev?.status === "unavailable") continue;
      map.set(r.user_id, { status: next, start: r.start_date, end: r.end_date });
    }
    return map;
  }, [availabilityRows, eventDate]);

  const statusByUser = useMemo(() => {
    const m = new Map<string, Status>();
    absenceByUser.forEach((v, k) => m.set(k, v.status));
    return m;
  }, [absenceByUser]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.user_id)), [assignments]);

  // Tri : assignés en tête, puis staff équipe avant renforts, puis alpha.
  const people = useMemo<Candidate[]>(() => {
    const list = [...pool];
    list.sort((a, b) => {
      const aa = assignedIds.has(a.user_id) ? 0 : 1;
      const bb = assignedIds.has(b.user_id) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      if (a.isReinforcement !== b.isReinforcement) return a.isReinforcement ? 1 : -1;
      return a.full_name.localeCompare(b.full_name);
    });
    return list;
  }, [pool, assignedIds]);

  // ---- Mutations -----------------------------------------------------------

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("event_staff_assignments")
        .insert({ event_id: eventId, user_id: userId, assigned_by: user?.id ?? null });
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      toast.success(t("staffAssignment.assigned", { defaultValue: "Coach assigné" }));
      qc.invalidateQueries({ queryKey: ["event-staff-assignments", eventId] });
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      dispatchStaffAssignmentPush({
        data: { eventId, userId, action: "assigned" },
      }).catch((e) => console.warn("[staff] assign push failed", (e as Error).message));
      dispatchStaffAssignmentEmail({
        data: { eventId, userId, action: "assigned", origin: getPublicOrigin() },
      }).catch((e) => console.warn("[staff] assign email failed", (e as Error).message));
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      if (msg.includes("row-level security") || msg.includes("check")) {
        toast.error(
          t("staffAssignment.notAssignableStaff", {
            defaultValue:
              "Assignation refusée : cette personne n'a pas de rôle d'encadrant (coach, adjoint, admin ou dirigeant) dans le club.",
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
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      dispatchStaffAssignmentPush({
        data: { eventId, userId, action: "unassigned" },
      }).catch((e) => console.warn("[staff] unassign push failed", (e as Error).message));
      dispatchStaffAssignmentEmail({
        data: { eventId, userId, action: "unassigned", origin: getPublicOrigin() },
      }).catch((e) => console.warn("[staff] unassign email failed", (e as Error).message));
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

  const [pickerOpen, setPickerOpen] = useState(false);

  const assignedPeople = useMemo(
    () => people.filter((c) => assignedIds.has(c.user_id)),
    [people, assignedIds],
  );
  const unassignedPeople = useMemo(
    () => people.filter((c) => !assignedIds.has(c.user_id)),
    [people, assignedIds],
  );

  // ---- Render --------------------------------------------------------------

  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  const renderAssignedRow = (c: Candidate) => {
    const status = statusByUser.get(c.user_id) ?? "available";
    const absence = absenceByUser.get(c.user_id);
    const roleLabel =
      c.role === "assistant_coach"
        ? t("teams.role.assistant_coach", { defaultValue: "Adjoint" })
        : t("teams.role.coach", { defaultValue: "Coach" });
    const baseMeta = [roleLabel, c.teamName].filter(Boolean).join(" · ");
    const absenceLabel = absence
      ? absence.start === absence.end
        ? t("staffAssignment.absentOn", { defaultValue: "Absent le {{d}}", d: fmt(absence.start) })
        : t("staffAssignment.absentRange", {
            defaultValue: "Absent du {{s}} au {{e}}",
            s: fmt(absence.start),
            e: fmt(absence.end),
          })
      : null;
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
          <div className="text-[11px] text-muted-foreground truncate">{baseMeta}</div>
          {absenceLabel && (
            <div
              className={cn(
                "text-[11px] truncate",
                status === "unavailable"
                  ? "text-destructive"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              {absenceLabel}
            </div>
          )}
        </div>
        <StatusDot status={status} />
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
      </li>
    );
  };

  const availableCount = useMemo(
    () =>
      people.filter((c) => (statusByUser.get(c.user_id) ?? "available") !== "unavailable").length,
    [people, statusByUser],
  );
  const coverageState: "assured" | "unassigned" | "uncovered" =
    assignedPeople.length > 0 ? "assured" : availableCount > 0 ? "unassigned" : "uncovered";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
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
        <StaffCoverageBadge state={coverageState} />
      </div>

      {assignedPeople.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("staffAssignment.noneAssigned", {
            defaultValue: "Aucun coach assigné pour cet événement.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-border">{assignedPeople.map(renderAssignedRow)}</ul>
      )}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between h-9"
            disabled={people.length === 0 || unassignedPeople.length === 0}
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" />
              {people.length === 0
                ? t("staffAssignment.noCoachInClub", {
                    defaultValue: "Aucun coach dans ce club",
                  })
                : unassignedPeople.length === 0
                  ? t("staffAssignment.allAssigned", {
                      defaultValue: "Tous les coachs sont assignés",
                    })
                  : t("staffAssignment.addCoach", { defaultValue: "Assigner un coach" })}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
          align="start"
        >
          <Command>
            <CommandInput
              placeholder={t("staffAssignment.searchPlaceholder", {
                defaultValue: "Rechercher un coach…",
              })}
            />
            <CommandList>
              <CommandEmpty>
                {t("staffAssignment.noResults", { defaultValue: "Aucun coach trouvé." })}
              </CommandEmpty>
              <CommandGroup>
                {unassignedPeople.map((c) => {
                  const status = statusByUser.get(c.user_id) ?? "available";
                  const absence = absenceByUser.get(c.user_id);
                  const roleLabel =
                    c.role === "assistant_coach"
                      ? t("teams.role.assistant_coach", { defaultValue: "Adjoint" })
                      : t("teams.role.coach", { defaultValue: "Coach" });
                  const meta = [roleLabel, c.teamName].filter(Boolean).join(" · ");
                  const absenceLabel = absence
                    ? absence.start === absence.end
                      ? t("staffAssignment.absentOn", {
                          defaultValue: "Absent le {{d}}",
                          d: fmt(absence.start),
                        })
                      : t("staffAssignment.absentRange", {
                          defaultValue: "Absent du {{s}} au {{e}}",
                          s: fmt(absence.start),
                          e: fmt(absence.end),
                        })
                    : null;
                  return (
                    <CommandItem
                      key={c.user_id}
                      value={`${c.full_name} ${meta}`}
                      onSelect={() => {
                        setPickerOpen(false);
                        requestAssign(c);
                      }}
                      className="flex items-center gap-2"
                    >
                      <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
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
                        {absenceLabel && (
                          <div
                            className={cn(
                              "text-[11px] truncate",
                              status === "unavailable"
                                ? "text-destructive"
                                : "text-amber-600 dark:text-amber-400",
                            )}
                          >
                            {absenceLabel}
                          </div>
                        )}
                      </div>
                      <StatusDot status={status} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

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
                defaultValue: "Ce coach présente un conflit sur ce créneau. Continuer ?",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { defaultValue: "Annuler" })}</AlertDialogCancel>
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
