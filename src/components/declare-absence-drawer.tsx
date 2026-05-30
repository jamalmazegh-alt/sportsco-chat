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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Palmtree, HeartPulse, GraduationCap, Users, Briefcase, HelpCircle, Swords, Dumbbell, Trophy, Calendar } from "lucide-react";

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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-selected player; if omitted, derived from current user (player or parent). */
  playerId?: string;
  onCreated?: () => void;
}

type Candidate = { id: string; first_name: string; last_name: string };

export function DeclareAbsenceDrawer({ open, onOpenChange, playerId: initialPlayerId, onCreated }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);
  const [playerId, setPlayerId] = useState<string>(initialPlayerId ?? "");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState<Reason>("vacation");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setPlayerId(initialPlayerId ?? "");
      setStartDate(today);
      setEndDate(today);
      setReason("vacation");
      setComment("");
      setForceConfirm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPlayerId]);

  // Candidates: players linked to the current user (as player or parent).
  const { data: candidates = [] } = useQuery({
    queryKey: ["absence-candidates", user?.id, initialPlayerId],
    enabled: open && !!user?.id && !initialPlayerId,
    queryFn: async (): Promise<Candidate[]> => {
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
  const [debouncedDates, setDebouncedDates] = useState<{ s: string; e: string }>({ s: startDate, e: endDate });
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDates({ s: startDate, e: endDate }), 400);
    return () => clearTimeout(t);
  }, [startDate, endDate]);

  const { data: impactedEvents = [] } = useQuery({
    queryKey: ["absence-impacted-events", playerId, debouncedDates.s, debouncedDates.e],
    enabled: open && !!playerId && !!debouncedDates.s && !!debouncedDates.e && debouncedDates.e >= debouncedDates.s,
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
      return (data ?? []).map((r: any) => ({ id: r.id, title: r.title, starts_at: r.starts_at, type: r.type }));
    },
    staleTime: 30_000,
  });

  function eventIcon(type: string) {
    switch (type) {
      case "match": return Swords;
      case "training": return Dumbbell;
      case "tournament": return Trophy;
      case "meeting": return Users;
      default: return Calendar;
    }
  }

  async function checkOverlap(): Promise<boolean> {
    const { count } = await supabase
      .from("player_availabilities")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId)
      .eq("status", "active")
      .lte("start_date", endDate)
      .gte("end_date", startDate);
    return (count ?? 0) > 0;
  }

  async function notifyCoaches(playerName: string, startStr: string, endStr: string, reasonLabel: string, events: ImpactedEvent[]) {
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
      new Set((coaches ?? []).map((c: any) => c.user_id).filter((u: string | null) => u && u !== user?.id)),
    );
    if (uids.length === 0) return;
    let body = t("notification.absenceDeclared", {
      name: playerName,
      start: startStr,
      end: endStr,
      reason: reasonLabel,
      defaultValue: `${playerName} sera absent(e) du ${startStr} au ${endStr}. Motif : ${reasonLabel}`,
    });
    if (events.length > 0) {
      const labelFor = (type: string) => {
        switch (type) {
          case "match": return t("eventType.match", { defaultValue: "Match" });
          case "training": return t("eventType.training", { defaultValue: "Entraînement" });
          case "tournament": return t("eventType.tournament", { defaultValue: "Tournoi" });
          case "meeting": return t("eventType.meeting", { defaultValue: "Réunion" });
          default: return t("eventType.other", { defaultValue: "Événement" });
        }
      };
      const fmtShort = (d: string) =>
        new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
      const top = events.slice(0, 3).map((ev) => `${labelFor(ev.type)} ${fmtShort(ev.starts_at)}`);
      let eventsStr = top.join(", ");
      if (events.length > 3) {
        eventsStr += `, ${t("availability.impactedEventsMore", { n: events.length - 3, defaultValue: `et ${events.length - 3} autre(s) événement(s)` })}`;
      }
      body += "\n" + t("availability.notifImpacted", { events: eventsStr, defaultValue: `Événements impactés : ${eventsStr}` });
    }
    await supabase.from("notifications").insert(
      uids.map((uid) => ({
        user_id: uid,
        type: "availability_declared",
        title: t("availability.upcomingWidget", { defaultValue: "Absence déclarée" }),
        body,
        link: `/players/${playerId}`,
      })),
    );
  }


  async function onSubmit() {
    if (!playerId) {
      toast.error(t("availability.errors.missingPlayer", { defaultValue: "Sélectionnez un joueur." }));
      return;
    }
    if (endDate < startDate) {
      toast.error(t("availability.errors.invalidRange", { defaultValue: "Dates invalides." }));
      return;
    }
    setBusy(true);
    try {
      if (!forceConfirm) {
        const overlap = await checkOverlap();
        if (overlap) {
          setBusy(false);
          const ok = window.confirm(
            t("availability.overlapWarning", {
              defaultValue: "⚠️ Une absence est déjà déclarée sur cette période. Confirmer quand même ?",
            }),
          );
          if (!ok) return;
          setForceConfirm(true);
          setBusy(true);
        }
      }
      const { error } = await supabase.from("player_availabilities").insert({
        player_id: playerId,
        created_by_user_id: user!.id,
        start_date: startDate,
        end_date: endDate,
        reason,
        comment: comment.trim() || null,
      });
      if (error) throw error;

      // Notify coaches (best-effort)
      try {
        const playerRes = await supabase
          .from("players")
          .select("first_name, last_name")
          .eq("id", playerId)
          .maybeSingle();
        const p = playerRes.data;
        const name = p ? `${p.first_name ?? ""} ${p.last_name?.[0] ?? ""}.`.trim() : "";
        const reasonLabel = t(`availability.reason.${reason}`, { defaultValue: reason });
        const fmt = (d: string) => new Date(d).toLocaleDateString();
        await notifyCoaches(name, fmt(startDate), fmt(endDate), reasonLabel, impactedEvents);
      } catch {
        /* ignore notify errors */
      }

      toast.success(t("availability.saved", { defaultValue: "Absence enregistrée" }));
      qc.invalidateQueries({ queryKey: ["player-availabilities"] });
      qc.invalidateQueries({ queryKey: ["upcoming-absences"] });
      qc.invalidateQueries({ queryKey: ["event-availabilities"] });
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
        <SheetHeader>
          <SheetTitle>{t("availability.declare", { defaultValue: "Déclarer une absence" })}</SheetTitle>
          <SheetDescription>
            {t("availability.drawerHint", {
              defaultValue: "Indique la période et le motif. Le coach sera informé.",
            })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {!initialPlayerId && candidates.length > 1 && (
            <div className="space-y-1.5">
              <Label>{t("availability.forChild", { defaultValue: "Pour quel enfant ?" })}</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("availability.startDate", { defaultValue: "Date de début" })}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("availability.endDate", { defaultValue: "Date de fin" })}</Label>
              <Input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.reasonLabel", { defaultValue: "Motif" })}</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map(({ value, Icon }) => (
                  <SelectItem key={value} value={value}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 opacity-70" />
                      {t(`availability.reason.${value}`, { defaultValue: value })}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("availability.comment", { defaultValue: "Commentaire" })}</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              rows={3}
              maxLength={300}
              placeholder={t("availability.commentPlaceholder", { defaultValue: "Optionnel" })}
            />
            <p className="text-[10px] text-muted-foreground text-right">{comment.length}/300</p>
          </div>

          {impactedEvents.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">
                {t("availability.impactedEvents", { defaultValue: "📅 Cette absence impactera :" })}
              </p>
              <ul className="space-y-1.5">
                {impactedEvents.slice(0, 10).map((ev) => {
                  const Icon = eventIcon(ev.type);
                  return (
                    <li key={ev.id} className="flex items-center gap-2 text-xs text-muted-foreground">
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
            {t("common.cancel", { defaultValue: "Annuler" })}
          </Button>
          <Button onClick={onSubmit} disabled={busy || !playerId}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("availability.save", { defaultValue: "Enregistrer l'absence" })
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
