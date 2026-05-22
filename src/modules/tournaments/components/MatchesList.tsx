import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { ResponsiveFormDialog } from "@/components/responsive-form-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  Check,
  MapPin,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  Plus,
  Minus,
  Trash2,
  Flag,
  Radio,
  Zap,
} from "lucide-react";
import { ScoreStepper } from "@/components/score-stepper";

import { toast } from "sonner";
import {
  recordMatchScore,
  updateMatchSchedule,
  validateMatch,
  setMatchDispute,
  setMatchStatus,
  recordMatchEvent,
  deleteMatchEvent,
  listMatchEvents,
  listTournamentCollaborators,
  assignMatchReferee,
} from "../tournaments.functions";

import type { ScoringRules, SetScore } from "../lib/formats";
import { aggregateSetsScore, formatSets, DEFAULT_SETS_RULES } from "../lib/formats";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
}
interface Match {
  id: string;
  round: string;
  group_id: string | null;
  match_number: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  penalty_score_a?: number | null;
  penalty_score_b?: number | null;
  sets?: SetScore[] | null;
  status: string;
  scheduled_at: string | null;
  field?: string | null;
  validated_at?: string | null;
  dispute_flag?: boolean | null;
  referee_user_id?: string | null;
  referee_name?: string | null;
}

interface MatchEvent {
  id: string;
  match_id: string;
  team_id: string | null;
  kind: string;
  player_name: string | null;
  minute: number | null;
}
interface RefereeOption {
  user_id: string;
  label: string;
}

interface Props {
  tournamentId: string;
  matches: Match[];
  teams: Team[];
  canManage?: boolean;
  fields?: string[];
  scoring?: ScoringRules;
}

export function MatchesList({ tournamentId, matches, teams, canManage, fields, scoring }: Props) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const grouped = matches.reduce<Record<string, Match[]>>((acc, m) => {
    const key = m.round === "group" ? "Phase de groupes" : roundLabel(m.round);
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  const listFn = useServerFn(listMatchEvents);
  const eventsQ = useQuery({
    queryKey: ["tournament-events", tournamentId],
    queryFn: () => listFn({ data: { tournament_id: tournamentId } }),
  });
  const eventsByMatch = new Map<string, MatchEvent[]>();
  for (const ev of (eventsQ.data?.events ?? []) as MatchEvent[]) {
    if (!eventsByMatch.has(ev.match_id)) eventsByMatch.set(ev.match_id, []);
    eventsByMatch.get(ev.match_id)!.push(ev);
  }

  // Accepted referees (with a user account) — used to populate the per-match selector.
  const collabFn = useServerFn(listTournamentCollaborators);
  const collabQ = useQuery({
    queryKey: ["tournament-collaborators", tournamentId],
    queryFn: () => collabFn({ data: { tournament_id: tournamentId } }),
    enabled: !!canManage,
  });
  const refereeOptions: RefereeOption[] = ((collabQ.data?.collaborators ?? []) as any[])
    .filter(
      (c) =>
        c.role === "referee" && !!c.accepted_at && !c.revoked_at && !!c.user_id,
    )
    .map((c) => ({
      user_id: c.user_id as string,
      label: (c.display_name as string | null) || (c.email as string),
    }));

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([round, ms]) => (
        <section key={round} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            {round}
          </h3>
          <ul className="space-y-2">
            {ms.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                tournamentId={tournamentId}
                teamA={m.team_a_id ? teamMap.get(m.team_a_id) : undefined}
                teamB={m.team_b_id ? teamMap.get(m.team_b_id) : undefined}
                canManage={!!canManage}
                fields={fields ?? []}
                events={eventsByMatch.get(m.id) ?? []}
                scoring={scoring}
                refereeOptions={refereeOptions}
              />
            ))}
          </ul>
        </section>
      ))}
      {matches.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aucun match programmé. Génère les poules ou le bracket pour commencer.
        </div>
      )}
    </div>
  );
}

function roundLabel(r: string) {
  const map: Record<string, string> = {
    r32: "32es de finale",
    r16: "8es de finale",
    qf: "Quarts de finale",
    sf: "Demi-finales",
    final: "Finale",
    third_place: "3e place",
  };
  return map[r] ?? r;
}

const EVENT_KINDS: { value: string; label: string; emoji: string }[] = [
  { value: "goal", label: "But", emoji: "⚽" },
  { value: "own_goal", label: "CSC", emoji: "🥅" },
  { value: "assist", label: "Passe déc.", emoji: "🅰️" },
  { value: "yellow_card", label: "Jaune", emoji: "🟨" },
  { value: "second_yellow", label: "2e jaune", emoji: "🟨🟨" },
  { value: "red_card", label: "Rouge", emoji: "🟥" },
  { value: "penalty", label: "Penalty", emoji: "🎯" },
  { value: "foul", label: "Faute", emoji: "⚠️" },
];

function eventMeta(kind: string) {
  return EVENT_KINDS.find((k) => k.value === kind) ?? { emoji: "•", label: kind };
}

function MatchCard({
  match,
  tournamentId,
  teamA,
  teamB,
  canManage,
  fields,
  events,
  scoring,
  refereeOptions,
}: {
  match: Match;
  tournamentId: string;
  teamA?: Team;
  teamB?: Team;
  canManage: boolean;
  fields: string[];
  events: MatchEvent[];
  scoring?: ScoringRules;
  refereeOptions: RefereeOption[];
}) {
  const setsMode = scoring?.mode === "sets";
  const setsRules = scoring?.sets ?? DEFAULT_SETS_RULES;
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [a, setA] = useState(match.score_a ?? 0);
  const [b, setB] = useState(match.score_b ?? 0);
  const [penA, setPenA] = useState(match.penalty_score_a ?? 0);
  const [penB, setPenB] = useState(match.penalty_score_b ?? 0);
  const [sets, setSets] = useState<SetScore[]>(
    (match.sets ?? []).map((s) => ({ a: s.a, b: s.b })),
  );
  const isKnockout = match.round !== "group";
  const tied = a === b;
  const hasPenalty = (match.penalty_score_a ?? null) !== null && (match.penalty_score_b ?? null) !== null;

  const fn = useServerFn(recordMatchScore);
  const schedFn = useServerFn(updateMatchSchedule);
  const valFn = useServerFn(validateMatch);
  const dispFn = useServerFn(setMatchDispute);
  const evFn = useServerFn(recordMatchEvent);
  const evDelFn = useServerFn(deleteMatchEvent);
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    qc.invalidateQueries({ queryKey: ["tournament-events", tournamentId] });
  };

  const save = useMutation({
    mutationFn: () => {
      if (setsMode && sets.length > 0) {
        const agg = aggregateSetsScore(sets);
        return fn({
          data: {
            tournament_id: tournamentId,
            match_id: match.id,
            score_a: agg.score_a,
            score_b: agg.score_b,
            sets,
            status: "completed",
          },
        });
      }
      return fn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          score_a: a,
          score_b: b,
          penalty_score_a: isKnockout && a === b ? penA : null,
          penalty_score_b: isKnockout && a === b ? penB : null,
          sets: null,
          status: "completed",
        },
      });
    },

    onSuccess: () => {
      toast.success("Score enregistré");
      invalidateAll();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  // Quick inline live score update (no dialog, keeps status "live")
  const liveUpdate = useMutation({
    mutationFn: (next: { score_a: number; score_b: number }) =>
      fn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          score_a: next.score_a,
          score_b: next.score_b,
          sets: null,
          status: "live",
        },
      }),
    onSuccess: () => invalidateAll(),
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });


  const validateM = useMutation({
    mutationFn: (validated: boolean) =>
      valFn({
        data: { tournament_id: tournamentId, match_id: match.id, validated },
      }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const disputeM = useMutation({
    mutationFn: (dispute: boolean) =>
      dispFn({
        data: { tournament_id: tournamentId, match_id: match.id, dispute },
      }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      invalidateAll();
    },
  });

  const statusFn = useServerFn(setMatchStatus);
  const statusM = useMutation({
    mutationFn: (status: string) =>
      statusFn({
        data: { tournament_id: tournamentId, match_id: match.id, status: status as any },
      }),
    onSuccess: () => {
      toast.success("Statut du match mis à jour");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const initialDate = match.scheduled_at ? new Date(match.scheduled_at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [editField, setEditField] = useState<string>(match.field ?? "");
  const [editDate, setEditDate] = useState<string>(
    initialDate
      ? `${initialDate.getFullYear()}-${pad(initialDate.getMonth() + 1)}-${pad(initialDate.getDate())}`
      : "",
  );
  const [editTime, setEditTime] = useState<string>(
    initialDate ? `${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}` : "",
  );

  const saveSched = useMutation({
    mutationFn: () => {
      let scheduled_at: string | null = null;
      if (editDate && editTime) {
        scheduled_at = new Date(`${editDate}T${editTime}:00`).toISOString();
      }
      return schedFn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          field: editField ? editField : null,
          scheduled_at,
        },
      });
    },
    onSuccess: () => {
      toast.success("Match mis à jour");
      invalidateAll();
      setEditOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  // Referee assignment
  const refFn = useServerFn(assignMatchReferee);
  const initialRefValue = match.referee_user_id
    ? `user:${match.referee_user_id}`
    : match.referee_name
      ? "free"
      : "__none__";
  const [refMode, setRefMode] = useState<string>(initialRefValue);
  const [refFreeName, setRefFreeName] = useState<string>(match.referee_name ?? "");
  const saveRef = useMutation({
    mutationFn: () => {
      let payload: { referee_user_id: string | null; referee_name: string | null };
      if (refMode === "__none__") {
        payload = { referee_user_id: null, referee_name: null };
      } else if (refMode === "free") {
        payload = { referee_user_id: null, referee_name: refFreeName.trim() || null };
      } else {
        payload = { referee_user_id: refMode.replace(/^user:/, ""), referee_name: null };
      }
      return refFn({
        data: { tournament_id: tournamentId, match_id: match.id, ...payload },
      });
    },
    onSuccess: () => {
      toast.success("Arbitre mis à jour");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  // Add event form
  const [evTeam, setEvTeam] = useState<string>(match.team_a_id ?? "");
  const [evKind, setEvKind] = useState<string>("yellow_card");
  const [evPlayer, setEvPlayer] = useState("");
  const [evMinute, setEvMinute] = useState<string>("");

  const addEvent = useMutation({
    mutationFn: () =>
      evFn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          team_id: evTeam || null,
          kind: evKind as any,
          player_name: evPlayer || null,
          minute: evMinute ? parseInt(evMinute, 10) : null,
        },
      }),
    onSuccess: () => {
      setEvPlayer("");
      setEvMinute("");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const removeEvent = useMutation({
    mutationFn: (event_id: string) =>
      evDelFn({ data: { tournament_id: tournamentId, event_id } }),
    onSuccess: () => invalidateAll(),
  });

  const done = match.status === "completed";
  const validated = !!match.validated_at;
  const disputed = !!match.dispute_flag;
  const whenLabel = initialDate
    ? `${pad(initialDate.getDate())}/${pad(initialDate.getMonth() + 1)} ${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}`
    : null;

  return (
    <li>
      <div className="w-full rounded-xl border border-border bg-card p-3 text-left">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">#{match.match_number ?? "—"}</span>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap justify-end">
            {whenLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {whenLabel}
              </span>
            )}
            {match.field && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {match.field}
              </span>
            )}
            {(match.referee_user_id || match.referee_name) && (
              <span className="inline-flex items-center gap-1">
                <Flag className="h-3 w-3" />
                {match.referee_name ||
                  refereeOptions.find((r) => r.user_id === match.referee_user_id)?.label ||
                  "Arbitre"}
              </span>
            )}
            {done && !validated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                <Check className="h-3 w-3" />
                Provisoire
              </span>
            )}
            {validated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                Validé
              </span>
            )}
            {disputed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Litige
              </span>
            )}
            {match.status === "cancelled" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">Annulé</span>
            )}
            {match.status === "forfeit_a" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-950/40 px-2 py-0.5 text-orange-700 dark:text-orange-300">Forfait A</span>
            )}
            {match.status === "forfeit_b" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-950/40 px-2 py-0.5 text-orange-700 dark:text-orange-300">Forfait B</span>
            )}
            {match.status === "no_show_a" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-950/40 px-2 py-0.5 text-orange-700 dark:text-orange-300">A absente</span>
            )}
            {match.status === "no_show_b" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-950/40 px-2 py-0.5 text-orange-700 dark:text-orange-300">B absente</span>
            )}
            {match.status === "abandoned" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 text-amber-700 dark:text-amber-300">Abandonné</span>
            )}
          </div>
        </div>
        {canManage && match.status === "live" && !setsMode && teamA && teamB ? (
          <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                <Radio className="h-3 w-3 animate-pulse" />
                Score en direct
              </span>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-[11px] text-muted-foreground underline"
              >
                Saisie complète
              </button>
            </div>
            <div className="flex items-center justify-around gap-2">
              <ScoreStepper
                label={teamA.short_name ?? teamA.name}
                value={match.score_a ?? 0}
                onChange={(v) =>
                  liveUpdate.mutate({ score_a: v, score_b: match.score_b ?? 0 })
                }
                disabled={liveUpdate.isPending}
                size="md"
              />
              <span className="text-xl text-muted-foreground">:</span>
              <ScoreStepper
                label={teamB.short_name ?? teamB.name}
                value={match.score_b ?? 0}
                onChange={(v) =>
                  liveUpdate.mutate({ score_a: match.score_a ?? 0, score_b: v })
                }
                disabled={liveUpdate.isPending}
                size="md"
              />
            </div>
            <Button
              size="sm"
              className="w-full mt-3 h-9"
              onClick={() => {
                setA(match.score_a ?? 0);
                setB(match.score_b ?? 0);
                save.mutate();
              }}
              disabled={save.isPending}
            >
              <Check className="h-4 w-4" />
              Terminer le match
            </Button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={!teamA || !teamB || !canManage}
              className="mt-1.5 w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2 active:scale-[0.99] transition disabled:opacity-70"
            >
              <span className="truncate text-sm font-medium text-right">
                {teamA?.name ?? "À déterminer"}
              </span>
              <span className="font-semibold tabular-nums text-lg">
                {match.score_a ?? "–"} : {match.score_b ?? "–"}
                {hasPenalty && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (tab {match.penalty_score_a}-{match.penalty_score_b})
                  </span>
                )}
              </span>
              <span className="truncate text-sm font-medium">
                {teamB?.name ?? "À déterminer"}
              </span>
            </button>

            {setsMode && match.sets && match.sets.length > 0 && (
              <p className="mt-1 text-center text-[11px] text-muted-foreground tabular-nums">
                {formatSets(match.sets)}
              </p>
            )}
            {canManage &&
              match.status === "scheduled" &&
              teamA &&
              teamB && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full h-8 text-xs border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                  onClick={() => statusM.mutate("live")}
                  disabled={statusM.isPending}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Démarrer le match en direct
                </Button>
              )}
          </>
        )}


        {/* Events summary (always visible if any) */}
        {events.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {events.map((ev) => {
              const meta = eventMeta(ev.kind);
              const isA = ev.team_id === match.team_a_id;
              return (
                <li
                  key={ev.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                >
                  <span>{meta.emoji}</span>
                  {ev.minute != null && <span className="font-mono">{ev.minute}'</span>}
                  {ev.player_name && <span>{ev.player_name}</span>}
                  <span className="text-muted-foreground">
                    {isA ? teamA?.short_name ?? teamA?.name : teamB?.short_name ?? teamB?.name}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeEvent.mutate(ev.id)}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canManage && (
          <div className="mt-2 flex flex-wrap justify-end gap-1">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  <ChevronDown className="h-3 w-3" />
                  Événements
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="w-full mt-2 rounded-lg border border-border bg-muted/30 p-2 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Select value={evKind} onValueChange={setEvKind}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.emoji} {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={evTeam} onValueChange={setEvTeam}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Équipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamA && (
                        <SelectItem value={teamA.id}>{teamA.name}</SelectItem>
                      )}
                      {teamB && (
                        <SelectItem value={teamB.id}>{teamB.name}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Joueur"
                    value={evPlayer}
                    onChange={(e) => setEvPlayer(e.target.value)}
                  />
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    min={0}
                    max={200}
                    placeholder="Min."
                    value={evMinute}
                    onChange={(e) => setEvMinute(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs w-full"
                  onClick={() => addEvent.mutate()}
                  disabled={addEvent.isPending || !evTeam}
                >
                  {addEvent.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Ajouter l'événement
                </Button>
              </CollapsibleContent>
            </Collapsible>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setEditOpen(true)}
            >
              Terrain / heure
            </Button>
            {done && (
              <Button
                variant={validated ? "outline" : "default"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => validateM.mutate(!validated)}
                disabled={validateM.isPending}
              >
                <ShieldCheck className="h-3 w-3" />
                {validated ? "Annuler validation" : "Valider"}
              </Button>
            )}
            <Button
              variant={disputed ? "destructive" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => disputeM.mutate(!disputed)}
              disabled={disputeM.isPending}
            >
              <AlertTriangle className="h-3 w-3" />
              {disputed ? "Lever litige" : "Signaler litige"}
            </Button>
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={match.status}
              disabled={statusM.isPending}
              onChange={(e) => statusM.mutate(e.target.value)}
              aria-label="État du match"
            >
              <option value="scheduled">Prévu</option>
              <option value="live">En cours</option>
              <option value="completed">Terminé</option>
              <option value="forfeit_a">Forfait équipe A</option>
              <option value="forfeit_b">Forfait équipe B</option>
              <option value="no_show_a">Équipe A absente</option>
              <option value="no_show_b">Équipe B absente</option>
              <option value="abandoned">Abandonné</option>
              <option value="cancelled">Annulé</option>
            </select>
          </div>
        )}
      </div>


      <ResponsiveFormDialog open={open} onOpenChange={setOpen} title="Saisir le score">
        <div className="space-y-4 mt-4 pb-6">
          {setsMode ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Best of {setsRules.bestOf} · sets à {setsRules.pointsToWin} pts
                {setsRules.tieBreakPoints !== setsRules.pointsToWin
                  ? ` (tie-break ${setsRules.tieBreakPoints})`
                  : ""}
              </p>
              {sets.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Aucun set saisi.
                </p>
              )}
              {sets.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Set {i + 1}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setSets(sets.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-around gap-2">
                    <ScoreStepper
                      label={teamA?.short_name ?? teamA?.name}
                      value={s.a}
                      onChange={(v) => {
                        const next = [...sets];
                        next[i] = { ...next[i], a: v };
                        setSets(next);
                      }}
                      size="sm"
                    />
                    <span className="text-xl text-muted-foreground">:</span>
                    <ScoreStepper
                      label={teamB?.short_name ?? teamB?.name}
                      value={s.b}
                      onChange={(v) => {
                        const next = [...sets];
                        next[i] = { ...next[i], b: v };
                        setSets(next);
                      }}
                      size="sm"
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setSets([...sets, { a: 0, b: 0 }])}
                disabled={sets.length >= 7}
              >
                <Plus className="h-4 w-4" />
                Ajouter un set
              </Button>
              {sets.length > 0 && (
                <p className="text-center text-sm font-medium">
                  Sets gagnés :{" "}
                  <span className="tabular-nums">
                    {aggregateSetsScore(sets).score_a} - {aggregateSetsScore(sets).score_b}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-around gap-3 py-2">
              <ScoreStepper
                label={teamA?.name}
                value={a}
                onChange={setA}
                size="lg"
              />
              <span className="text-2xl font-semibold text-muted-foreground">:</span>
              <ScoreStepper
                label={teamB?.name}
                value={b}
                onChange={setB}
                size="lg"
              />
            </div>
          )}
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || (setsMode && sets.length === 0)}
            className="w-full h-12"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Valider le score"
            )}
          </Button>
        </div>
      </ResponsiveFormDialog>



      <ResponsiveFormDialog open={editOpen} onOpenChange={setEditOpen} title="Terrain & horaire">
        <div className="space-y-4 mt-4 pb-6">
          <div className="space-y-1.5">
            <Label>Terrain</Label>
            {fields.length > 0 ? (
              <Select
                value={editField || "__none__"}
                onValueChange={(v) => setEditField(v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {fields.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={editField}
                onChange={(e) => setEditField(e.target.value)}
                placeholder="Terrain 1"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Heure</Label>
              <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => saveSched.mutate()} disabled={saveSched.isPending} className="w-full">
            {saveSched.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer terrain & heure"}
          </Button>

          <div className="pt-4 border-t border-border space-y-3">
            <div className="space-y-1.5">
              <Label>Arbitre</Label>
              <Select value={refMode} onValueChange={setRefMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucun</SelectItem>
                  {refereeOptions.map((r) => (
                    <SelectItem key={r.user_id} value={`user:${r.user_id}`}>
                      {r.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="free">Nom libre…</SelectItem>
                </SelectContent>
              </Select>
              {refMode === "free" && (
                <Input
                  className="mt-2"
                  value={refFreeName}
                  onChange={(e) => setRefFreeName(e.target.value)}
                  placeholder="Nom de l'arbitre"
                />
              )}
              {refereeOptions.length === 0 && refMode !== "free" && refMode !== "__none__" && (
                <p className="text-[11px] text-muted-foreground">
                  Aucun arbitre n'a encore accepté son invitation.
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => saveRef.mutate()}
              disabled={saveRef.isPending || (refMode === "free" && !refFreeName.trim())}
            >
              {saveRef.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assigner l'arbitre"}
            </Button>
          </div>
        </div>
      </ResponsiveFormDialog>
    </li>
  );
}
