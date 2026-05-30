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

  async function notifyCoaches(playerName: string, startStr: string, endStr: string, reasonLabel: string) {
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
    const body = t("notification.absenceDeclared", {
      name: playerName,
      start: startStr,
      end: endStr,
      reason: reasonLabel,
      defaultValue: `${playerName} sera absent(e) du ${startStr} au ${endStr}. Motif : ${reasonLabel}`,
    });
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
        await notifyCoaches(name, fmt(startDate), fmt(endDate), reasonLabel);
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
