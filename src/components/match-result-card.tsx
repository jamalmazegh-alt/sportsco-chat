import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Pencil, Loader2, Trophy, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type GoalKind = "goal" | "own_goal" | "penalty";

type Goal = {
  id: string;
  scorer_player_id: string;
  assist_player_id: string | null;
  minute: number | null;
  kind: GoalKind;
};

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  jersey_number: number | null;
};

export function MatchResultCard({
  eventId,
  teamId,
  teamName,
  isHome,
  opponent,
  isCoach,
  startsAt,
}: {
  eventId: string;
  teamId: string;
  teamName?: string | null;
  isHome: boolean | null;
  opponent: string | null;
  isCoach: boolean;
  startsAt: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState("0");
  const [away, setAway] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // New goal form
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [scorerId, setScorerId] = useState<string>("");
  const [assistId, setAssistId] = useState<string>("none");
  const [minute, setMinute] = useState<string>("");
  const [kind, setKind] = useState<GoalKind>("goal");
  const [addingGoal, setAddingGoal] = useState(false);

  const isPast = new Date(startsAt).getTime() < Date.now();

  const { data: result } = useQuery({
    queryKey: ["match-result", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("match_results")
        .select("id, home_score, away_score, notes")
        .eq("event_id", eventId)
        .maybeSingle();
      return data;
    },
  });

  const { data: goals } = useQuery({
    queryKey: ["event-goals", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_goals")
        .select("id, scorer_player_id, assist_player_id, minute, kind")
        .eq("event_id", eventId)
        .order("minute", { ascending: true, nullsFirst: false });
      return (data ?? []) as Goal[];
    },
  });

  // Players that can be selected as scorer/assist (convoqués of this event)
  const { data: players } = useQuery({
    queryKey: ["event-convoqued-players", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("convocations")
        .select("players:player_id(id, first_name, last_name, jersey_number)")
        .eq("event_id", eventId);
      return ((data ?? [])
        .map((r: any) => r.players)
        .filter(Boolean)) as Player[];
    },
  });

  const playersById = useMemo(() => {
    const m = new Map<string, Player>();
    (players ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  useEffect(() => {
    if (result) {
      setHome(String(result.home_score));
      setAway(String(result.away_score));
      setNotes(result.notes ?? "");
    }
  }, [result]);

  async function saveResult() {
    if (!user) return;
    setSaving(true);
    const home_score = Math.max(0, parseInt(home, 10) || 0);
    const away_score = Math.max(0, parseInt(away, 10) || 0);
    const payload = {
      event_id: eventId,
      home_score,
      away_score,
      notes: notes.trim() || null,
      recorded_by: user.id,
    };
    const { error } = await supabase
      .from("match_results")
      .upsert(payload, { onConflict: "event_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("match.resultSaved"));
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["match-result", eventId] });
  }

  async function addGoal() {
    if (!user || !scorerId) return;
    setAddingGoal(true);
    const min =
      minute.trim() === "" ? null : Math.max(0, Math.min(200, parseInt(minute, 10) || 0));
    const { error } = await supabase.from("event_goals").insert({
      event_id: eventId,
      scorer_player_id: scorerId,
      assist_player_id: assistId === "none" ? null : assistId,
      minute: min,
      kind,
      created_by: user.id,
    });
    setAddingGoal(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setScorerId("");
    setAssistId("none");
    setMinute("");
    setKind("goal");
    setShowGoalForm(false);
    qc.invalidateQueries({ queryKey: ["event-goals", eventId] });
  }

  async function deleteGoal(id: string) {
    const { error } = await supabase.from("event_goals").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["event-goals", eventId] });
  }

  if (!isPast && !result) {
    // Match hasn't started yet & no result entered → don't show anything for non-coaches
    if (!isCoach) return null;
  }

  // Display helpers
  const homeScore = result?.home_score ?? 0;
  const awayScore = result?.away_score ?? 0;
  const ourSide = isHome === false ? "away" : "home"; // default home if unknown
  const ourScore = ourSide === "home" ? homeScore : awayScore;
  const theirScore = ourSide === "home" ? awayScore : homeScore;
  const outcome =
    ourScore > theirScore ? "win" : ourScore < theirScore ? "loss" : "draw";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Trophy className="h-4 w-4" /> {t("match.result")}
        </h2>
        {isCoach && !editing && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {result ? t("common.edit") : t("match.enterScore")}
          </Button>
        )}
      </div>

      {!editing && result && (
        <div
          className={cn(
            "rounded-xl border p-4 flex items-center justify-center gap-4",
            outcome === "win" && "bg-present/10 border-present/30",
            outcome === "loss" && "bg-absent/10 border-absent/30",
            outcome === "draw" && "bg-muted border-border"
          )}
        >
          <div className="text-center flex-1 min-w-0">
            <p className="text-xs uppercase text-muted-foreground tracking-wider truncate">
              {teamName ?? (ourSide === "home" ? t("events.home") : t("events.away"))}
            </p>
            <p className="text-3xl font-bold tabular-nums">{ourScore}</p>
          </div>
          <span className="text-2xl text-muted-foreground">—</span>
          <div className="text-center flex-1 min-w-0">
            <p className="text-xs uppercase text-muted-foreground tracking-wider truncate">
              {opponent ?? t("events.opponent")}
            </p>
            <p className="text-3xl font-bold tabular-nums">{theirScore}</p>
          </div>
        </div>
      )}

      {!editing && !result && isCoach && (
        <p className="text-sm text-muted-foreground italic">
          {t("match.noResultYet")}
        </p>
      )}

      {editing && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs truncate">
                {ourSide === "home"
                  ? teamName ?? t("events.home")
                  : opponent ?? t("events.home")}
              </Label>
              <Input
                type="number"
                min={0}
                value={ourSide === "home" ? home : away}
                onChange={(e) =>
                  ourSide === "home" ? setHome(e.target.value) : setAway(e.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs truncate">
                {ourSide === "home"
                  ? opponent ?? t("events.away")
                  : teamName ?? t("events.away")}
              </Label>
              <Input
                type="number"
                min={0}
                value={ourSide === "home" ? away : home}
                onChange={(e) =>
                  ourSide === "home" ? setAway(e.target.value) : setHome(e.target.value)
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("match.notesOptional")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(false);
                if (result) {
                  setHome(String(result.home_score));
                  setAway(String(result.away_score));
                  setNotes(result.notes ?? "");
                }
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={saveResult} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      )}

      {/* Scorers list */}
      {(result || (goals && goals.length > 0)) && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("match.scorers")}
            </p>
            {isCoach && !showGoalForm && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setShowGoalForm(true)}
              >
                <Plus className="h-3 w-3" /> {t("match.addGoal")}
              </Button>
            )}
          </div>

          {goals && goals.length > 0 ? (
            <ul className="space-y-1.5">
              {goals.map((g) => {
                const sc = playersById.get(g.scorer_player_id);
                const as = g.assist_player_id ? playersById.get(g.assist_player_id) : null;
                return (
                  <li
                    key={g.id}
                    className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-muted/50 group"
                  >
                    <span className="tabular-nums text-xs text-muted-foreground w-8 shrink-0">
                      {g.minute != null ? `${g.minute}'` : "—"}
                    </span>
                    <span className="flex-1 truncate">
                      <strong>
                        {sc ? `${sc.first_name ?? ""} ${sc.last_name ?? ""}`.trim() : "—"}
                      </strong>
                      {g.kind === "penalty" && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({t("match.penalty")})
                        </span>
                      )}
                      {g.kind === "own_goal" && (
                        <span className="text-xs text-destructive ml-1">
                          ({t("match.ownGoal")})
                        </span>
                      )}
                      {as && (
                        <span className="text-xs text-muted-foreground ml-2">
                          → {as.first_name ?? ""} {as.last_name ?? ""}
                        </span>
                      )}
                    </span>
                    {isCoach && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={() => deleteGoal(g.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            !showGoalForm && (
              <p className="text-xs text-muted-foreground italic">{t("match.noScorers")}</p>
            )
          )}

          {showGoalForm && isCoach && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("match.scorer")}
                  </Label>
                  <Select value={scorerId} onValueChange={setScorerId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("match.selectPlayer")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(players ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name}
                          {p.jersey_number ? ` · #${p.jersey_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("match.assistOptional")}
                  </Label>
                  <Select value={assistId} onValueChange={setAssistId}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(players ?? [])
                        .filter((p) => p.id !== scorerId)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.first_name} {p.last_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("match.minuteOptional")}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    value={minute}
                    onChange={(e) => setMinute(e.target.value)}
                    placeholder="ex: 32"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("match.type")}
                  </Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as GoalKind)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goal">{t("match.goal")}</SelectItem>
                      <SelectItem value="penalty">{t("match.penalty")}</SelectItem>
                      <SelectItem value="own_goal">{t("match.ownGoal")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowGoalForm(false);
                    setScorerId("");
                    setAssistId("none");
                    setMinute("");
                    setKind("goal");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={addGoal} disabled={addingGoal || !scorerId}>
                  {addingGoal ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {t("match.addGoal")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
