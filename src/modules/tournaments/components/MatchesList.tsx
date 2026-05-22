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
  Trash2,
} from "lucide-react";
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
} from "../tournaments.functions";

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
  status: string;
  scheduled_at: string | null;
  field?: string | null;
  validated_at?: string | null;
  dispute_flag?: boolean | null;
}
interface MatchEvent {
  id: string;
  match_id: string;
  team_id: string | null;
  kind: string;
  player_name: string | null;
  minute: number | null;
}

interface Props {
  tournamentId: string;
  matches: Match[];
  teams: Team[];
  canManage?: boolean;
  fields?: string[];
}

export function MatchesList({ tournamentId, matches, teams, canManage, fields }: Props) {
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
}: {
  match: Match;
  tournamentId: string;
  teamA?: Team;
  teamB?: Team;
  canManage: boolean;
  fields: string[];
  events: MatchEvent[];
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [a, setA] = useState(match.score_a ?? 0);
  const [b, setB] = useState(match.score_b ?? 0);
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
    mutationFn: () =>
      fn({
        data: {
          tournament_id: tournamentId,
          match_id: match.id,
          score_a: a,
          score_b: b,
          status: "completed",
        },
      }),
    onSuccess: () => {
      toast.success("Score enregistré");
      invalidateAll();
      setOpen(false);
    },
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!teamA || !teamB}
          className="mt-1.5 w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2 active:scale-[0.99] transition disabled:opacity-50"
        >
          <span className="truncate text-sm font-medium text-right">
            {teamA?.name ?? "À déterminer"}
          </span>
          <span className="font-semibold tabular-nums">
            {match.score_a ?? "–"} : {match.score_b ?? "–"}
          </span>
          <span className="truncate text-sm font-medium">
            {teamB?.name ?? "À déterminer"}
          </span>
        </button>

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
          </div>
        )}
      </div>

      <ResponsiveFormDialog open={open} onOpenChange={setOpen} title="Saisir le score">
        <div className="space-y-4 mt-4 pb-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="text-center">
              <p className="text-sm font-medium mb-2 truncate">{teamA?.name}</p>
              <Input
                type="number"
                min={0}
                value={a}
                onChange={(e) => setA(parseInt(e.target.value || "0", 10))}
                className="h-14 text-center text-2xl font-bold"
              />
            </div>
            <span className="text-xl font-semibold text-muted-foreground">:</span>
            <div className="text-center">
              <p className="text-sm font-medium mb-2 truncate">{teamB?.name}</p>
              <Input
                type="number"
                min={0}
                value={b}
                onChange={(e) => setB(parseInt(e.target.value || "0", 10))}
                className="h-14 text-center text-2xl font-bold"
              />
            </div>
          </div>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
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
            {saveSched.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </div>
      </ResponsiveFormDialog>
    </li>
  );
}
