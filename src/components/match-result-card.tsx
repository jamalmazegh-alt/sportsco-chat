import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Trophy,
  Save,
  X,
  Square,
  AlertTriangle,
} from "lucide-react";
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
import { getSportConfig, SOLO_STAT_KINDS, type StatKind } from "@/lib/sport-config";
import { ConfettiBurst } from "@/components/confetti-burst";
import { ScoreStepper } from "@/components/score-stepper";
import { dispatchScorePush } from "@/lib/push-dispatch.functions";

type Goal = {
  id: string;
  scorer_player_id: string;
  assist_player_id: string | null;
  minute: number | null;
  kind: StatKind;
};

type Player = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  jersey_number: number | null;
};

type SetScore = [number, number]; // [home, away]

export function MatchResultCard({
  eventId,
  teamId,
  teamName,
  isHome,
  opponent,
  isCoach,
  startsAt,
  sport,
}: {
  eventId: string;
  teamId: string;
  teamName?: string | null;
  isHome: boolean | null;
  opponent: string | null;
  isCoach: boolean;
  startsAt: string;
  sport?: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const dispatchScorePushFn = useServerFn(dispatchScorePush);
  const cfg = getSportConfig(sport);

  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState("0");
  const [away, setAway] = useState("0");
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState<SetScore[]>([]);
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(0);

  // New event form
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [scorerId, setScorerId] = useState<string>("");
  const [assistId, setAssistId] = useState<string>("none");
  const [minute, setMinute] = useState<string>("");
  const [kind, setKind] = useState<StatKind>(cfg.defaultStatKind);
  const [addingGoal, setAddingGoal] = useState(false);

  const isPast = new Date(startsAt).getTime() < Date.now();

  const { data: result } = useQuery({
    queryKey: ["match-result", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("match_results")
        .select("id, home_score, away_score, notes, score_details")
        .eq("event_id", eventId)
        .maybeSingle();
      return data as {
        id: string;
        home_score: number;
        away_score: number;
        notes: string | null;
        score_details: { sets?: SetScore[] } | null;
      } | null;
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

  const { data: players } = useQuery({
    queryKey: ["event-roster-players", eventId, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convocations")
        .select("players:player_id(id, first_name, last_name, jersey_number)")
        .eq("event_id", eventId);
      if (error) throw error;
      const fromConv = (data ?? []).map((r: any) => r.players).filter(Boolean) as Player[];
      if (fromConv.length > 0) return fromConv;

      // Fallback: load roster directly from team_members when no convocations exist
      if (!teamId) return [];
      const { data: tm, error: tmErr } = await supabase
        .from("team_members")
        .select("players:player_id(id, first_name, last_name, jersey_number)")
        .eq("team_id", teamId)
        .eq("role", "player");
      if (tmErr) throw tmErr;
      return (tm ?? []).map((r: any) => r.players).filter(Boolean) as Player[];
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
      setSets(Array.isArray(result.score_details?.sets) ? result.score_details!.sets! : []);
    }
  }, [result]);

  // Auto-derive sets-won score for volleyball when sets are added
  useEffect(() => {
    if (cfg.scoreUnit !== "sets" || !editing) return;
    let h = 0,
      a = 0;
    sets.forEach(([sh, sa]) => {
      if (sh > sa) h++;
      else if (sa > sh) a++;
    });
    setHome(String(h));
    setAway(String(a));
  }, [sets, cfg.scoreUnit, editing]);

  async function saveResult() {
    if (!user) return;
    setSaving(true);
    const home_score = Math.max(0, parseInt(home, 10) || 0);
    const away_score = Math.max(0, parseInt(away, 10) || 0);
    const payload: any = {
      event_id: eventId,
      home_score,
      away_score,
      notes: notes.trim() || null,
      recorded_by: user.id,
      score_details: cfg.setScoresEnabled && sets.length > 0 ? { sets } : null,
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
    // Celebrate wins only — subtle delight, not noise.
    const ourScore = isHome === false ? away_score : home_score;
    const theirScore = isHome === false ? home_score : away_score;
    if (ourScore > theirScore) setCelebrate((n) => n + 1);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["match-result", eventId] });

    // Web Push fire-and-forget — notifie équipe + joueurs convoqués
    void (async () => {
      try {
        await dispatchScorePushFn({ data: { eventId } });
      } catch (e) {
        console.warn("[push] score dispatch failed", e);
      }
    })();
  }

  async function addGoal() {
    if (!user || !scorerId) return;
    setAddingGoal(true);
    const min =
      !cfg.minuteEnabled || minute.trim() === ""
        ? null
        : Math.max(0, Math.min(200, parseInt(minute, 10) || 0));
    const isSolo = SOLO_STAT_KINDS.includes(kind);
    const { error } = await supabase.from("event_goals").insert({
      event_id: eventId,
      scorer_player_id: scorerId,
      assist_player_id: !cfg.assistsEnabled || isSolo || assistId === "none" ? null : assistId,
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
    setKind(cfg.defaultStatKind);
    setShowGoalForm(false);
    qc.invalidateQueries({ queryKey: ["event-goals", eventId] });
    qc.invalidateQueries({ queryKey: ["event-feedback", eventId] });
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
    if (!isCoach) return null;
  }

  // Display helpers
  const homeScore = result?.home_score ?? 0;
  const awayScore = result?.away_score ?? 0;
  const ourSide = isHome === false ? "away" : "home";
  const ourScore = ourSide === "home" ? homeScore : awayScore;
  const theirScore = ourSide === "home" ? awayScore : homeScore;
  const outcome = ourScore > theirScore ? "win" : ourScore < theirScore ? "loss" : "draw";

  const savedSets = result?.score_details?.sets ?? [];

  const isSoloKind = SOLO_STAT_KINDS.includes(kind);

  const outcomePill =
    outcome === "win"
      ? {
          label: t("match.outcomeWin"),
          cls: "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white ring-emerald-500/30",
        }
      : outcome === "loss"
        ? {
            label: t("match.outcomeLoss"),
            cls: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
          }
        : {
            label: t("match.outcomeDraw"),
            cls: "bg-muted text-muted-foreground ring-border",
          };

  return (
    <section className="rounded-2xl border-[1.5px] border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <ConfettiBurst trigger={celebrate} />

      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/22">
            <Trophy className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-extrabold tracking-tight text-foreground truncate">
            {t("match.result")}
          </h2>
        </div>
        {result ? (
          isCoach &&
          !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:opacity-80"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("common.edit")}
            </button>
          )
        ) : isPast ? (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 bg-amber-500/15 text-amber-600 ring-amber-500/30">
            {t("match.pillToEnter")}
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 bg-sky-500/15 text-sky-600 ring-sky-500/30">
            {t("match.pillUpcoming")}
          </span>
        )}
      </header>

      <div className="px-5 py-4 space-y-4">
        {!editing && result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Side
                name={teamName ?? (ourSide === "home" ? t("events.home") : t("events.away"))}
                ours
              />
              <span className="font-display text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">
                {ourScore}
                <span className="mx-1.5 align-[3px] text-xl text-muted-foreground" aria-hidden>
                  —
                </span>
                {theirScore}
              </span>
              <Side name={opponent ?? t("events.opponent")} />
            </div>
            <div className="flex justify-center">
              <span
                className={cn(
                  "inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide ring-1",
                  outcomePill.cls,
                )}
              >
                {outcomePill.label}
              </span>
            </div>
            {cfg.setScoresEnabled && savedSets.length > 0 && (
              <p className="text-center text-xs text-muted-foreground tabular-nums">
                {savedSets
                  .map(([h, a]) => (ourSide === "home" ? `${h}-${a}` : `${a}-${h}`))
                  .join(" · ")}
              </p>
            )}
          </div>
        )}

        {!editing && !result && !isPast && (
          <p className="text-xs text-muted-foreground italic">{t("match.notPlayedYet")}</p>
        )}

        {!editing && !result && isPast && isCoach && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/22 bg-primary/8 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{t("match.finishedTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("match.finishedHint")}</p>
            </div>
            <Button
              size="sm"
              onClick={() => setEditing(true)}
              className="shrink-0 rounded-xl transition active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              {t("match.enterResult")}
            </Button>
          </div>
        )}

        {!editing && !result && isPast && !isCoach && (
          <p className="text-xs text-muted-foreground italic">{t("match.noResultYet")}</p>
        )}

        {editing && (
          <div className="space-y-3">
            {cfg.setScoresEnabled ? (
              <SetScoresEditor
                sets={sets}
                onChange={setSets}
                ourSide={ourSide}
                teamName={teamName}
                opponent={opponent}
                t={t}
              />
            ) : (
              <div className="flex items-center justify-around gap-2 py-2 sm:gap-3">
                <ScoreStepper
                  label={
                    ourSide === "home"
                      ? (teamName ?? t("events.home"))
                      : (opponent ?? t("events.home"))
                  }
                  value={parseInt(home, 10) || 0}
                  onChange={(v) => setHome(String(v))}
                  size="md"
                  responsiveLg
                />
                <span className="text-xl font-semibold text-muted-foreground sm:text-2xl">:</span>
                <ScoreStepper
                  label={
                    ourSide === "home"
                      ? (opponent ?? t("events.away"))
                      : (teamName ?? t("events.away"))
                  }
                  value={parseInt(away, 10) || 0}
                  onChange={(v) => setAway(String(v))}
                  size="md"
                  responsiveLg
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {t("match.notesOptional")}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                className="rounded-xl border-[1.5px] border-input focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-[1.5px]"
                onClick={() => {
                  setEditing(false);
                  if (result) {
                    setHome(String(result.home_score));
                    setAway(String(result.away_score));
                    setNotes(result.notes ?? "");
                    setSets(result.score_details?.sets ?? []);
                  }
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={saveResult}
                disabled={saving}
                className="rounded-xl bg-gradient-to-br from-[#1d7a45] to-[#2d9d5f] hover:from-[#185c34] hover:to-[#22834d] text-white shadow-[0_8px_20px_-10px_rgba(29,122,69,0.6)] active:scale-[0.98] transition"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Player events ("Faits de match") */}
      {cfg.statKinds.length > 0 && (isCoach || result || (goals && goals.length > 0)) && (
        <div className="px-5 py-4 space-y-3 border-t border-border">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {t("match.playerEvents")}
            </p>
            {isCoach && !showGoalForm && (
              <button
                type="button"
                onClick={() => setShowGoalForm(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:opacity-80"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("match.addEvent")}
              </button>
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
                    <KindIcon kind={g.kind} />
                    <span className="flex-1 truncate">
                      <strong>
                        {sc ? `${sc.first_name ?? ""} ${sc.last_name ?? ""}`.trim() : "—"}
                      </strong>
                      <span className="text-xs text-muted-foreground ml-1">
                        · {t(`match.kinds.${g.kind}`)}
                      </span>
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
              <p className="text-xs text-muted-foreground italic">{t("match.noEvents")}</p>
            )
          )}

          {showGoalForm && isCoach && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("match.kind")}
                  </Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as StatKind)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cfg.statKinds.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`match.kinds.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("match.player")}
                  </Label>
                  <Select value={scorerId} onValueChange={setScorerId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("match.selectPlayer")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(players ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {[p.first_name, p.last_name].filter(Boolean).join(" ") || "Joueur"}
                          {p.jersey_number ? ` · #${p.jersey_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(cfg.assistsEnabled && !isSoloKind) || cfg.minuteEnabled ? (
                <div className="grid grid-cols-2 gap-2">
                  {cfg.assistsEnabled && !isSoloKind && (
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
                                {[p.first_name, p.last_name].filter(Boolean).join(" ") || "Joueur"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {cfg.minuteEnabled && (
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
                  )}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowGoalForm(false);
                    setScorerId("");
                    setAssistId("none");
                    setMinute("");
                    setKind(cfg.defaultStatKind);
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
                  {t("match.addEvent")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FootballBall({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6.5l3 2v4l-3 2-3-2v-4z" />
      <path d="M9 8.5l-3-2M15 8.5l3-2M9 14.5l-3 2M15 14.5l3 2" />
    </svg>
  );
}

function KindIcon({ kind }: { kind: StatKind }) {
  if (kind === "yellow_card")
    return <Square className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500 shrink-0" />;
  if (kind === "red_card")
    return <Square className="h-3.5 w-3.5 fill-red-500 text-red-600 shrink-0" />;
  if (kind === "white_card")
    return <Square className="h-3.5 w-3.5 fill-white text-muted-foreground shrink-0" />;
  if (kind === "foul" || kind === "penalty" || kind === "own_goal")
    return <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
  if (kind === "goal") return <FootballBall className="h-3.5 w-3.5 text-primary shrink-0" />;
  return <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />;
}

function SetScoresEditor({
  sets,
  onChange,
  ourSide,
  teamName,
  opponent,
  t,
}: {
  sets: SetScore[];
  onChange: (s: SetScore[]) => void;
  ourSide: "home" | "away";
  teamName?: string | null;
  opponent: string | null;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{t("match.sets")}</Label>
      <div className="space-y-2">
        {sets.map((s, i) => {
          const ours = ourSide === "home" ? s[0] : s[1];
          const theirs = ourSide === "home" ? s[1] : s[0];
          return (
            <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("match.set")} {i + 1}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => onChange(sets.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <div className="flex items-center justify-around gap-2">
                <ScoreStepper
                  label={teamName ?? undefined}
                  value={ours}
                  onChange={(v) => {
                    const next = [...sets];
                    next[i] = ourSide === "home" ? [v, s[1]] : [s[0], v];
                    onChange(next);
                  }}
                  size="sm"
                />
                <span className="text-xl text-muted-foreground">:</span>
                <ScoreStepper
                  label={opponent ?? undefined}
                  value={theirs}
                  onChange={(v) => {
                    const next = [...sets];
                    next[i] = ourSide === "home" ? [s[0], v] : [v, s[1]];
                    onChange(next);
                  }}
                  size="sm"
                />
              </div>
            </div>
          );
        })}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => onChange([...sets, [0, 0]])}
      >
        <Plus className="h-3.5 w-3.5" /> {t("match.addSet")}
      </Button>
    </div>
  );
}

/**
 * Un camp du tableau de score : écusson d'initiales et nom.
 *
 * L'écusson distingue les deux équipes sans avoir besoin de lire — émeraude
 * pour nous, violet pour l'adversaire, comme la pastille domicile/extérieur
 * de la carte de liste.
 */
function Side({ name, ours = false }: { name: string; ours?: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[10px] font-display text-xs font-bold",
          ours
            ? "bg-primary/13 text-primary"
            : "bg-violet-500/13 text-violet-700 dark:text-violet-300",
        )}
        aria-hidden
      >
        {initials}
      </span>
      <span className="w-full truncate text-[11.5px] font-semibold leading-tight">{name}</span>
    </span>
  );
}
