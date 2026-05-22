import { useState, useEffect, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shuffle, Trophy, Clock, CalendarClock, HelpCircle, Plus, X, MapPin, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import {
  autoCreateGroupsAndFixtures,
  generateKnockoutFromGroups,
  updateTournament,
  autoScheduleMatches,
} from "../tournaments.functions";

interface Props {
  tournamentId: string;
  format: "group" | "knockout" | "mixed";
  numTeams: number;
  groupsCount: number;
  matchesCount: number;
  startsOn?: string;
  matchDurationMin?: number | null;
  breakMin?: number | null;
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  fields?: string[] | null;
  settings?: Record<string, any> | null;
}

export function GroupsAndFixtures({
  tournamentId,
  format,
  numTeams,
  groupsCount,
  matchesCount,
  startsOn,
  matchDurationMin,
  breakMin,
  dailyStartTime,
  dailyEndTime,
  fields,
  settings,
}: Props) {
  const qc = useQueryClient();
  const [numGroups, setNumGroups] = useState(2);
  const [qualifiers, setQualifiers] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(false);

  // Match scheduling settings
  const [duration, setDuration] = useState(matchDurationMin ?? 20);
  const [pause, setPause] = useState(breakMin ?? 5);
  const [startTime, setStartTime] = useState(dailyStartTime ?? "09:00");
  const [endTime, setEndTime] = useState(dailyEndTime ?? "18:00");
  const [fieldsList, setFieldsList] = useState<string[]>(
    fields && fields.length ? fields : ["Terrain 1"],
  );
  const [newField, setNewField] = useState("");
  const [lunchEnabled, setLunchEnabled] = useState<boolean>(!!settings?.lunch_start);
  const [lunchStart, setLunchStart] = useState<string>(settings?.lunch_start ?? "12:00");
  const [lunchEnd, setLunchEnd] = useState<string>(settings?.lunch_end ?? "13:30");

  useEffect(() => {
    setDuration(matchDurationMin ?? 20);
    setPause(breakMin ?? 5);
    setStartTime(dailyStartTime ?? "09:00");
    setEndTime(dailyEndTime ?? "18:00");
    setFieldsList(fields && fields.length ? fields : ["Terrain 1"]);
    setLunchEnabled(!!settings?.lunch_start);
    setLunchStart(settings?.lunch_start ?? "12:00");
    setLunchEnd(settings?.lunch_end ?? "13:30");
  }, [matchDurationMin, breakMin, dailyStartTime, dailyEndTime, fields, settings]);

  function addField() {
    const v = newField.trim();
    if (!v) return;
    if (fieldsList.includes(v)) {
      toast.error("Ce terrain existe déjà");
      return;
    }
    setFieldsList([...fieldsList, v]);
    setNewField("");
  }
  function removeField(name: string) {
    setFieldsList(fieldsList.filter((f) => f !== name));
  }
  function onFieldKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addField();
    }
  }

  const genGroupsFn = useServerFn(autoCreateGroupsAndFixtures);
  const genKnockoutFn = useServerFn(generateKnockoutFromGroups);
  const updateFn = useServerFn(updateTournament);
  const scheduleFn = useServerFn(autoScheduleMatches);

  const genGroups = useMutation({
    mutationFn: () =>
      genGroupsFn({
        data: {
          tournament_id: tournamentId,
          num_groups: numGroups,
          qualifiers_per_group: qualifiers,
        },
      }),
    onSuccess: (res) => {
      toast.success(`${res.groups_created} poules · ${res.matches_created} matchs`);
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const genKnockout = useMutation({
    mutationFn: () =>
      genKnockoutFn({
        data: { tournament_id: tournamentId, third_place: thirdPlace },
      }),
    onSuccess: (res) => {
      toast.success(`${res.matches_created} matchs de bracket créés`);
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const saveSettings = useMutation({
    mutationFn: () => {
      const fl = fieldsList.length ? fieldsList : ["Terrain 1"];
      const nextSettings = {
        ...(settings ?? {}),
        lunch_start: lunchEnabled ? lunchStart : null,
        lunch_end: lunchEnabled ? lunchEnd : null,
      };
      return updateFn({
        data: {
          tournament_id: tournamentId,
          patch: {
            match_duration_min: duration,
            break_min: pause,
            daily_start_time: startTime,
            daily_end_time: endTime,
            fields: fl,
            settings: nextSettings,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Réglages enregistrés");
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const schedule = useMutation({
    mutationFn: async () => {
      if (!startsOn) throw new Error("Date de début manquante");
      const fl = fieldsList.length ? fieldsList : ["Terrain 1"];
      // Save settings first so they persist
      await saveSettings.mutateAsync();
      return scheduleFn({
        data: {
          tournament_id: tournamentId,
          starts_on: startsOn,
          daily_start_time: startTime,
          daily_end_time: endTime,
          match_duration_min: duration,
          break_min: pause,
          fields: fl,
          lunch_start_time: lunchEnabled ? lunchStart : undefined,
          lunch_end_time: lunchEnabled ? lunchEnd : undefined,
        },
      });
    },
    onSuccess: (res: any) => {
      toast.success(`${res.scheduled} matchs programmés`);
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const supportsGroups = format !== "knockout";
  const supportsKnockout = format !== "group";

  return (
    <div className="space-y-4">
      {supportsGroups && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shuffle className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Poules & calendrier</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {groupsCount} poule{groupsCount > 1 ? "s" : ""} · {matchesCount} match
            {matchesCount > 1 ? "s" : ""} programmé{matchesCount > 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre de poules</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={numGroups}
                onChange={(e) => setNumGroups(parseInt(e.target.value || "1", 10))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qualifiés / poule</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={qualifiers}
                onChange={(e) => setQualifiers(parseInt(e.target.value || "1", 10))}
              />
            </div>
          </div>
          <Button
            onClick={() => genGroups.mutate()}
            disabled={genGroups.isPending || numTeams < 2}
            className="w-full"
          >
            {genGroups.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Générer poules + matchs"
            )}
          </Button>
          {groupsCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ Régénérer supprimera les scores existants des matchs de poule.
            </p>
          )}
        </section>
      )}

      {supportsKnockout && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="font-medium flex items-center gap-1.5">
              Phase finale
              <span
                className="text-muted-foreground"
                title="Le bracket est le tableau à élimination directe : quarts → demis → finale. Affiché en arbre."
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </h3>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={thirdPlace}
              onChange={(e) => setThirdPlace(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Match pour la 3e place
          </label>
          <Button
            onClick={() => genKnockout.mutate()}
            disabled={genKnockout.isPending}
            variant="outline"
            className="w-full"
          >
            {genKnockout.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : format === "knockout" ? (
              "Générer le bracket"
            ) : (
              "Générer le bracket depuis les qualifiés"
            )}
          </Button>
          {format === "mixed" && (
            <p className="text-xs text-muted-foreground">
              Les meilleurs de chaque poule (selon classement actuel) sont placés dans le bracket.
            </p>
          )}
        </section>
      )}

      {/* Match scheduling */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Durée & horaires des matchs</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Durée d'un match (min)</Label>
            <Input
              type="number"
              min={1}
              max={240}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value || "0", 10))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Pause entre matchs (min)</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={pause}
              onChange={(e) => setPause(parseInt(e.target.value || "0", 10))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Début de journée</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fin de journée</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Terrains (séparés par virgule)</Label>
          <Input
            value={fieldsText}
            onChange={(e) => setFieldsText(e.target.value)}
            placeholder="Terrain 1, Terrain 2"
          />
          <p className="text-[11px] text-muted-foreground">
            Plusieurs terrains = matchs en parallèle. Tu peux aussi réassigner chaque match à un terrain dans l'onglet "Matchs".
          </p>
        </div>
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={lunchEnabled}
              onChange={(e) => setLunchEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Pause déjeuner (aucun match)
          </label>
          {lunchEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Début pause</Label>
                <Input
                  type="time"
                  value={lunchStart}
                  onChange={(e) => setLunchStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fin pause</Label>
                <Input
                  type="time"
                  value={lunchEnd}
                  onChange={(e) => setLunchEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => saveSettings.mutate()}
            disabled={saveSettings.isPending}
          >
            {saveSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Enregistrer"
            )}
          </Button>
          <Button
            onClick={() => schedule.mutate()}
            disabled={schedule.isPending || matchesCount === 0 || !startsOn}
          >
            {schedule.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CalendarClock className="h-4 w-4" />
                Programmer auto
              </>
            )}
          </Button>
        </div>
        {matchesCount === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Génère d'abord les poules ou le bracket avant de programmer.
          </p>
        )}
      </section>
    </div>
  );
}
