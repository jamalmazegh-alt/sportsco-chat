import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Ban, Check, X } from "lucide-react";
import { toast } from "sonner";

type Reason =
  | "red_card"
  | "accumulated_yellow_cards"
  | "federation_sanction"
  | "club_sanction"
  | "other";

type Suspension = {
  id: string;
  player_id: string;
  team_id: string;
  club_id: string;
  suspension_reason: Reason;
  suspension_notes: string | null;
  matches_to_serve: number;
  matches_served: number;
  suspension_start_date: string;
  first_match_id: string | null;
  status: "active" | "completed" | "cancelled";
};

interface Props {
  playerId: string;
  clubId: string;
}

export function PlayerSuspensions({ playerId, clubId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // List player's teams (suspension is per team)
  const { data: teams } = useQuery({
    queryKey: ["player-teams-for-suspension", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("team_id, teams:team_id(id, name, club_id)")
        .eq("player_id", playerId);
      const seen = new Set<string>();
      return (data ?? [])
        .map((r: any) => r.teams)
        .filter((tm: any) => tm && !seen.has(tm.id) && seen.add(tm.id));
    },
  });

  const { data: suspensions = [], refetch } = useQuery({
    queryKey: ["player-suspensions", playerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("player_suspensions")
        .select("*")
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Suspension[];
    },
  });

  // form state
  const [teamId, setTeamId] = useState<string>("");
  const [reason, setReason] = useState<Reason>("red_card");
  const [matches, setMatches] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [firstMatchId, setFirstMatchId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const { data: upcomingMatches = [] } = useQuery({
    queryKey: ["team-upcoming-official-matches", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, starts_at, type, is_official")
        .eq("team_id", teamId)
        .eq("is_official", true)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  async function onCreate() {
    if (!teamId) {
      toast.error("Select a team");
      return;
    }
    const { error } = await supabase.from("player_suspensions").insert({
      player_id: playerId,
      team_id: teamId,
      club_id: clubId,
      suspension_reason: reason,
      matches_to_serve: matches,
      suspension_start_date: startDate,
      first_match_id: firstMatchId || null,
      suspension_notes: notes || null,
      created_by: user?.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    // audit log (best effort)
    await supabase.from("audit_logs").insert({
      actor_user_id: user?.id,
      club_id: clubId,
      action: "suspension_created",
      entity_type: "player",
      entity_id: playerId,
    });
    toast.success(t("suspension.create"));
    setOpen(false);
    setMatches(1);
    setNotes("");
    setFirstMatchId("");
    refetch();
    qc.invalidateQueries({ queryKey: ["player-active-suspensions"] });
  }

  async function onCancel(s: Suspension) {
    const { error } = await supabase
      .from("player_suspensions")
      .update({ status: "cancelled" })
      .eq("id", s.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("audit_logs").insert({
      actor_user_id: user?.id,
      club_id: s.club_id,
      action: "suspension_cancelled",
      entity_type: "player",
      entity_id: s.player_id,
    });
    refetch();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Ban className="h-5 w-5 text-destructive" />
          <h3 className="font-medium">{t("suspension.title")}</h3>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              {t("suspension.create")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("suspension.create")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("teams.title", { defaultValue: "Team" })}</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {(teams ?? []).map((tm: any) => (
                      <SelectItem key={tm.id} value={tm.id}>{tm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("suspension.reason")}</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["red_card","accumulated_yellow_cards","federation_sanction","club_sanction","other"] as Reason[]).map((r) => (
                      <SelectItem key={r} value={r}>{t(`suspension.reason_${r}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("suspension.matchesToServe")}</Label>
                <Input type="number" min={1} value={matches} onChange={(e) => setMatches(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("suspension.startDate")}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              {teamId && upcomingMatches.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t("suspension.firstMatch")}</Label>
                  <Select value={firstMatchId} onValueChange={setFirstMatchId}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {upcomingMatches.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>
                          {new Date(m.starts_at).toLocaleDateString()} — {m.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("suspension.notes")}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
              <Button onClick={onCreate}>{t("suspension.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {suspensions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("suspension.noneActive")}</p>
      ) : (
        <ul className="space-y-2">
          {suspensions.map((s) => {
            const remaining = Math.max(0, s.matches_to_serve - s.matches_served);
            return (
              <li key={s.id} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {s.status === "active" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs">
                        <Ban className="h-3 w-3" />
                        {t("suspension.matchesLeft", { count: remaining })}
                      </span>
                    )}
                    {s.status === "completed" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-xs">
                        <Check className="h-3 w-3" />
                        {t("suspension.completed")}
                      </span>
                    )}
                    {s.status === "cancelled" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs">
                        <X className="h-3 w-3" />
                        {t("suspension.cancelled")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      · {t(`suspension.reason_${s.suspension_reason}`)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(s.suspension_start_date).toLocaleDateString()} — {s.matches_served}/{s.matches_to_serve}
                  </div>
                  {s.suspension_notes && (
                    <p className="text-xs text-muted-foreground mt-1 break-words">{s.suspension_notes}</p>
                  )}
                </div>
                {s.status === "active" && (
                  <Button size="sm" variant="ghost" onClick={() => onCancel(s)}>
                    {t("suspension.cancelAction")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
