import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Loader2, Check, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { recordMatchScore, updateMatchSchedule } from "../tournaments.functions";

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

function MatchCard({
  match,
  tournamentId,
  teamA,
  teamB,
  canManage,
  fields,
}: {
  match: Match;
  tournamentId: string;
  teamA?: Team;
  teamB?: Team;
  canManage: boolean;
  fields: string[];
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [a, setA] = useState(match.score_a ?? 0);
  const [b, setB] = useState(match.score_b ?? 0);
  const fn = useServerFn(recordMatchScore);
  const schedFn = useServerFn(updateMatchSchedule);
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setOpen(false);
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
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      setEditOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const done = match.status === "completed";
  const whenLabel = initialDate
    ? `${pad(initialDate.getDate())}/${pad(initialDate.getMonth() + 1)} ${pad(initialDate.getHours())}:${pad(initialDate.getMinutes())}`
    : null;

  return (
    <li>
      <div className="w-full rounded-xl border border-border bg-card p-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">#{match.match_number ?? "—"}</span>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
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
            {done && (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Terminé
              </span>
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
        {canManage && (
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setEditOpen(true)}
            >
              Modifier terrain / heure
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
