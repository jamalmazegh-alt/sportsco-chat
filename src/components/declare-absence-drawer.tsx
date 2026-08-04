import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { WizardOptionCard } from "@/components/wizard/wizard-primitives";
import { format } from "date-fns";
import { fr as frLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2,
  Palmtree,
  HeartPulse,
  GraduationCap,
  Users,
  Briefcase,
  HelpCircle,
  Swords,
  Dumbbell,
  Trophy,
  Calendar as CalendarIcon,
} from "lucide-react";

type ImpactedEvent = { id: string; title: string; starts_at: string; type: string };

type Reason = "vacation" | "injury" | "school" | "family" | "work" | "other";

const REASONS: Array<{ value: Reason; Icon: typeof Palmtree }> = [
  { value: "vacation", Icon: Palmtree },
  { value: "injury", Icon: HeartPulse },
  { value: "school", Icon: GraduationCap },
  { value: "family", Icon: Users },
  { value: "work", Icon: Briefcase },
  { value: "other", Icon: HelpCircle },
];

export interface PlayerAvailabilityEditPayload {
  id: string;
  player_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  comment: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-selected player; if omitted, derived from current user (player or parent) or from teamId. */
  playerId?: string;
  /** When provided, the candidate list = all players of this team (coach/admin flow). */
  teamId?: string;
  onCreated?: () => void;
  /** When provided, drawer runs in EDIT mode. */
  availability?: PlayerAvailabilityEditPayload | null;
}

type Candidate = { id: string; first_name: string; last_name: string };

export function DeclareAbsenceDrawer({
  open,
  onOpenChange,
  playerId: initialPlayerId,
  teamId,
  onCreated,
  availability,
}: Props) {
  const editing = !!availability;
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? frLocale : enUS;

  const { user } = useAuth();
  const qc = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(`${today}T00:00:00`);
  const [playerId, setPlayerId] = useState<string>(initialPlayerId ?? "");
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({
    from: todayDate,
    to: todayDate,
  });
  const startDate = range.from ? format(range.from, "yyyy-MM-dd") : today;
  const endDate = range.to
    ? format(range.to, "yyyy-MM-dd")
    : range.from
      ? format(range.from, "yyyy-MM-dd")
      : today;
  const [reason, setReason] = useState<Reason>("vacation");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (availability) {
      setPlayerId(availability.player_id);
      setRange({
        from: new Date(`${availability.start_date}T00:00:00`),
        to: new Date(`${availability.end_date}T00:00:00`),
      });
      setReason((availability.reason as Reason) ?? "vacation");
      setComment(availability.comment ?? "");
      setForceConfirm(false);
    } else {
      const t0 = new Date(`${today}T00:00:00`);
      setPlayerId(initialPlayerId ?? "");
      setRange({ from: t0, to: t0 });
      setReason("vacation");
      setComment("");
      setForceConfirm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPlayerId, availability?.id]);

  // Candidates:
  // - if teamId provided → all players of the team (coach flow)
  // - else → players linked to the current user (own or via parent link)
  const { data: candidates = [] } = useQuery({
    queryKey: ["absence-candidates", user?.id, initialPlayerId, teamId ?? null],
    enabled: open && !initialPlayerId && (!!teamId || !!user?.id),
    queryFn: async (): Promise<Candidate[]> => {
      if (teamId) {
        const { data } = await supabase
          .from("team_members")
          .select("players:player_id(id, first_name, last_name)")
          .eq("team_id", teamId)
          .eq("role", "player");
        const map = new Map<string, Candidate>();
        for (const r of (data ?? []) as any[]) {
          const p = r.players;
          if (p) map.set(p.id, p);
        }
        return Array.from(map.values()).sort((a, b) =>
          (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name),
        );
      }
      const [own, asParent] = await Promise.all([
        supabase.from("players").select("id, first_name, last_name").eq("user_id", user!.id),
        supabase
          .from("player_parents")
          .select("players:player_id(id, first_name, last_name)")
          .eq("parent_user_id", user!.id),
      ]);
      const map = new Map<string, Candidate>();
      for (const p of (own.data ?? []) as any[]) map.set(p.id, p);
      for (const r of (asParent.data ?? []) as any[]) {
        const p = r.players;
        if (p) map.set(p.id, p);
      }
      return Array.from(map.values()).sort((a, b) =>
        (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name),
      );
    },
  });

  // Auto-select if only one candidate
  useEffect(() => {
    if (!initialPlayerId && candidates.length === 1 && !playerId) {
      setPlayerId(candidates[0].id);
    }
  }, [candidates, playerId, initialPlayerId]);

  const selectedPlayer = useMemo(() => {
    if (initialPlayerId) return null;
    return candidates.find((c) => c.id === playerId) ?? null;
  }, [candidates, playerId, initialPlayerId]);

  // Debounced dates for impacted-events query
  const [debouncedDates, setDebouncedDates] = useState<{ s: string; e: string }>({
    s: startDate,
    e: endDate,
  });
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDates({ s: startDate, e: endDate }), 400);
    return () => clearTimeout(t);
  }, [startDate, endDate]);

  const { data: impactedEvents = [] } = useQuery({
    queryKey: ["absence-impacted-events", playerId, debouncedDates.s, debouncedDates.e],
    enabled:
      open &&
      !!playerId &&
      !!debouncedDates.s &&
      !!debouncedDates.e &&
      debouncedDates.e >= debouncedDates.s,
    queryFn: async (): Promise<ImpactedEvent[]> => {
      const { data: tm } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("player_id", playerId)
        .eq("role", "player");
      const teamIds = Array.from(new Set((tm ?? []).map((r: any) => r.team_id))).filter(Boolean);
      if (teamIds.length === 0) return [];
      const startIso = `${debouncedDates.s}T00:00:00`;
      const endIso = `${debouncedDates.e}T23:59:59`;
      const { data } = await supabase
        .from("events")
        .select("id, title, starts_at, type, status")
        .in("team_id", teamIds)
        .gte("starts_at", startIso)
        .lte("starts_at", endIso)
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .order("starts_at", { ascending: true })
        .limit(11);
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        starts_at: r.starts_at,
        type: r.type,
      }));
    },
    staleTime: 30_000,
  });

  function eventIcon(type: string) {
    switch (type) {
      case "match":
        return Swords;
      case "training":
        return Dumbbell;
      case "tournament":
        return Trophy;
      case "meeting":
        return Users;
      default:
        return CalendarIcon;
    }
  }

  async function checkOverlap(): Promise<boolean> {
    let q = supabase
      .from("player_availabilities")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId)
      .eq("status", "active")
      .lte("start_date", endDate)
      .gte("end_date", startDate);
    if (editing) q = q.neq("id", availability!.id);
    const { count } = await q;
    return (count ?? 0) > 0;
  }

  async function notifyCoaches(
    playerName: string,
    startStr: string,
    endStr: string,
    reasonLabel: string,
    events: ImpactedEvent[],
    declaredByName: string | null,
  ) {
    // Find teams of the player, then coaches/assistants
    const { data: tm } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("player_id", playerId)
      .eq("role", "player");
    const teamIds = Array.from(new Set((tm ?? []).map((r: any) => r.team_id))).filter(Boolean);
    if (teamIds.length === 0) return;
    const { data: coaches } = await supabase
      .from("team_members")
      .select("user_id, role")
      .in("team_id", teamIds)
      .in("role", ["coach", "assistant_coach", "admin"] as any);
    const uids = Array.from(
      new Set(
        (coaches ?? [])
          .map((c: any) => c.user_id)
          .filter((u: string | null) => u && u !== user?.id),
      ),
    );
    if (uids.length === 0) return;
    let body = t("notification.absenceDeclared", {
      name: playerName,
      start: startStr,
      end: endStr,
      reason: reasonLabel,
      defaultValue: `${playerName} sera absent(e) du ${startStr} au ${endStr}. Motif : ${reasonLabel}`,
    });
    if (declaredByName) {
      body +=
        " — " +
        t("notification.declaredBy", {
          name: declaredByName,
          defaultValue: `déclaré par ${declaredByName}`,
        });
    }
    if (events.length > 0) {
      const labelFor = (type: string) => {
        switch (type) {
          case "match":
            return t("eventType.match");
          case "training":
            return t("eventType.training");
          case "tournament":
            return t("eventType.tournament");
          case "meeting":
            return t("eventType.meeting");
          default:
            return t("eventType.other");
        }
      };
      const fmtShort = (d: string) =>
        new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
      const top = events.slice(0, 3).map((ev) => `${labelFor(ev.type)} ${fmtShort(ev.starts_at)}`);
      let eventsStr = top.join(", ");
      if (events.length > 3) {
        eventsStr += `, ${t("availability.impactedEventsMore", { n: events.length - 3, defaultValue: `et ${events.length - 3} autre(s) événement(s)` })}`;
      }
      body +=
        "\n" +
        t("availability.notifImpacted", {
          events: eventsStr,
          defaultValue: `Événements impactés : ${eventsStr}`,
        });
    }
    await supabase.from("notifications").insert(
      uids.map((uid) => ({
        user_id: uid,
        type: "availability_declared",
        title: t("availability.upcomingWidget"),
        body,
        link: `/players/${playerId}`,
      })),
    );
  }

  async function onSubmit() {
    if (!playerId) {
      toast.error(t("availability.errors.missingPlayer"));
      return;
    }
    if (endDate < startDate) {
      toast.error(t("availability.errors.invalidRange"));
      return;
    }
    setBusy(true);
    try {
      const overlap = await checkOverlap();
      if (overlap) {
        toast.error(t("availability.errors.overlap"));
        setBusy(false);
        return;
      }

      let insertedId: string | null = null;
      if (editing) {
        const { error } = await supabase
          .from("player_availabilities")
          .update({
            start_date: startDate,
            end_date: endDate,
            reason,
            comment: comment.trim() || null,
          })
          .eq("id", availability!.id);
        if (error) throw error;
        insertedId = availability!.id;
      } else {
        const { data: inserted, error } = await supabase
          .from("player_availabilities")
          .insert({
            player_id: playerId,
            created_by_user_id: user!.id,
            start_date: startDate,
            end_date: endDate,
            reason,
            comment: comment.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        insertedId = inserted?.id ?? null;
      }

      // Notify coaches on CREATE only (best-effort)
      if (!editing) {
        try {
          const [playerRes, declarerRes] = await Promise.all([
            supabase
              .from("players")
              .select("first_name, last_name")
              .eq("id", playerId)
              .maybeSingle(),
            supabase
              .from("profiles")
              .select("first_name, full_name")
              .eq("id", user!.id)
              .maybeSingle(),
          ]);
          const p = playerRes.data;
          const name = p ? `${p.first_name ?? ""} ${p.last_name?.[0] ?? ""}.`.trim() : "";
          const declaredByName =
            (declarerRes.data as any)?.first_name ||
            ((declarerRes.data as any)?.full_name ?? "").split(" ")[0] ||
            null;
          const isSelf =
            !!p &&
            (await supabase.from("players").select("user_id").eq("id", playerId).maybeSingle()).data
              ?.user_id === user!.id;
          const attribution = isSelf ? null : declaredByName;
          const reasonLabel = t(`availability.reason.${reason}`, { defaultValue: reason });
          const fmt = (d: string) => new Date(d).toLocaleDateString();
          await notifyCoaches(
            name,
            fmt(startDate),
            fmt(endDate),
            reasonLabel,
            impactedEvents,
            attribution,
          );

          if (insertedId) {
            const { notifyCoachesOfAbsence } = await import("@/lib/absence-notify.functions");
            notifyCoachesOfAbsence({ data: { availabilityId: insertedId } }).catch(() => undefined);
          }
        } catch {
          /* ignore notify errors */
        }
      }

      toast.success(editing ? t("availability.updated") : t("availability.saved"));
      qc.invalidateQueries({ queryKey: ["player-availabilities"] });
      qc.invalidateQueries({ queryKey: ["upcoming-absences"] });
      qc.invalidateQueries({ queryKey: ["event-availabilities"] });
      qc.invalidateQueries({ queryKey: ["event-absences"] });
      qc.invalidateQueries({ queryKey: ["team-active-absences"] });
      qc.invalidateQueries({ queryKey: ["lineup-absences"] });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pt-[env(safe-area-inset-top)]">
          <SheetTitle>{t("availability.declare")}</SheetTitle>
          <SheetDescription>{t("availability.drawerHint")}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {!initialPlayerId && candidates.length > 1 && (
            <div className="space-y-1.5">
              <Label>{teamId ? t("availability.forPlayer") : t("availability.forChild")}</Label>
              <Select value={playerId} onValueChange={setPlayerId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!initialPlayerId && selectedPlayer && candidates.length === 1 && (
            <p className="text-xs text-muted-foreground">
              {selectedPlayer.first_name} {selectedPlayer.last_name}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{t("availability.dates")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-11 w-full justify-start font-normal">
                  <CalendarIcon className="h-4 w-4" />
                  {startDate && endDate ? (
                    startDate === endDate ? (
                      <span>
                        {format(new Date(`${startDate}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        })}
                      </span>
                    ) : (
                      <span>
                        {format(new Date(`${startDate}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        })}
                        {" → "}
                        {format(new Date(`${endDate}T00:00:00`), "EEE d MMM", {
                          locale: dateLocale,
                        })}
                      </span>
                    )
                  ) : (
                    t("availability.pickRange")
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  numberOfMonths={1}
                  selected={range.from ? (range as { from: Date; to?: Date }) : undefined}
                  onSelect={(next: { from?: Date; to?: Date } | undefined, clickedDay?: Date) => {
                    // 3rd click: start a fresh range at the clicked day instead of extending.
                    if (range.from && range.to && clickedDay) {
                      setRange({ from: clickedDay, to: undefined });
                      return;
                    }
                    setRange(next ?? {});
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.reasonLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map(({ value, Icon }) => (
                <WizardOptionCard
                  key={value}
                  active={reason === value}
                  onClick={() => setReason(value)}
                  icon={<Icon className="h-4 w-4" />}
                  title={t(`availability.reason.${value}`, { defaultValue: value })}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.comment")}</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              rows={3}
              maxLength={300}
              placeholder={t("availability.commentPlaceholder")}
            />
            <p className="text-[10px] text-muted-foreground text-right">{comment.length}/300</p>
          </div>

          {impactedEvents.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">
                {t("availability.impactedEvents")}
              </p>
              <ul className="space-y-1.5">
                {impactedEvents.slice(0, 10).map((ev) => {
                  const Icon = eventIcon(ev.type);
                  return (
                    <li
                      key={ev.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate flex-1">{ev.title}</span>
                      <span className="shrink-0">
                        {new Date(ev.starts_at).toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {impactedEvents.length > 10 && (
                <p className="text-[11px] text-muted-foreground">
                  {t("availability.impactedEventsMore", {
                    n: impactedEvents.length - 10,
                    defaultValue: `et ${impactedEvents.length - 10} autre(s) événement(s)`,
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="mt-6 flex-row gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={busy || !playerId}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("availability.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
