import { useState, useEffect, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shuffle, Trophy, Clock, CalendarClock, HelpCircle, Plus, X, MapPin, UtensilsCrossed, Dices } from "lucide-react";
import { toast } from "sonner";

import {
  autoCreateGroupsAndFixtures,
  generateKnockoutFromGroups,
  updateTournament,
  autoScheduleMatches,
} from "../tournaments.functions";
import { DrawDialog } from "./DrawDialog";

interface Props {
  tournamentId: string;
  format: "group" | "knockout" | "mixed";
  status: string;
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
  teams: Array<{ id: string; name: string; short_name?: string | null; logo_url?: string | null }>;
}

export function GroupsAndFixtures({
  tournamentId,
  format,
  status,
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
  teams,
}: Props) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();
  const [drawOpen, setDrawOpen] = useState(false);

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
  const [minRest, setMinRest] = useState<number>(
    settings?.forfeit?.minRestMinutes ?? 30,
  );

  useEffect(() => {
    setDuration(matchDurationMin ?? 20);
    setPause(breakMin ?? 5);
    setStartTime(dailyStartTime ?? "09:00");
    setEndTime(dailyEndTime ?? "18:00");
    setFieldsList(fields && fields.length ? fields : ["Terrain 1"]);
    setLunchEnabled(!!settings?.lunch_start);
    setLunchStart(settings?.lunch_start ?? "12:00");
    setLunchEnd(settings?.lunch_end ?? "13:30");
    setMinRest(settings?.forfeit?.minRestMinutes ?? 30);
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
        forfeit: {
          ...(settings?.forfeit ?? {}),
          minRestMinutes: minRest,
        },
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
          min_rest_min: minRest,
        },
      });
    },
    onSuccess: (res: any) => {
      const skipped = res?.skipped ?? 0;
      toast.success(
        skipped > 0
          ? `${res.scheduled} matchs programmés · ${skipped} non placés (contrainte de repos)`
          : `${res.scheduled} matchs programmés`,
      );
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const supportsGroups = format !== "knockout";
  const supportsKnockout = format !== "group";

  const hasExistingDraw = groupsCount > 0 || matchesCount > 0;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Dices className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Tirage au sort</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {numTeams < 2
            ? "Ajoutez des équipes avant de lancer le tirage au sort."
            : "Auto, progressif (animation) ou manuel — répartit les équipes dans les poules ou le bracket."}
        </p>
        <Button
          onClick={() => setDrawOpen(true)}
          disabled={numTeams < 2}
          className="w-full"
          variant={hasExistingDraw ? "outline" : "default"}
        >
          <Dices className="h-4 w-4" />
          {hasExistingDraw ? "Relancer le tirage au sort" : "Lancer le tirage au sort"}
        </Button>
      </section>

      <DrawDialog
        open={drawOpen}
        onOpenChange={setDrawOpen}
        tournamentId={tournamentId}
        format={format}
        status={status}
        teams={teams}
        hasExistingDraw={hasExistingDraw}
      />

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
          <Label>Repos min. entre 2 matchs d'une même équipe (min)</Label>
          <Input
            type="number"
            min={0}
            max={720}
            value={minRest}
            onChange={(e) => setMinRest(parseInt(e.target.value || "0", 10))}
          />
          <p className="text-[11px] text-muted-foreground">
            Lors de la programmation auto, une équipe ne sera jamais reprogrammée avant ce délai. 0 = désactivé.
          </p>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            Terrains
          </Label>
          {fieldsList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Aucun terrain</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fieldsList.map((f) => (
                <Badge
                  key={f}
                  variant="secondary"
                  className="gap-1.5 pl-2.5 pr-1 py-1 text-sm font-normal"
                >
                  <MapPin className="h-3 w-3 opacity-70" />
                  {f}
                  <button
                    type="button"
                    onClick={() => removeField(f)}
                    className="ml-0.5 rounded-sm p-0.5 hover:bg-background/60 transition-colors"
                    aria-label={`Retirer ${f}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={onFieldKeyDown}
              placeholder="Nom du terrain (ex. Court central)"
            />
            <Button type="button" variant="outline" size="icon" onClick={addField}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Plusieurs terrains = matchs en parallèle. Réassignable par match dans l'onglet "Matchs".
          </p>
        </div>
        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            <input
              type="checkbox"
              checked={lunchEnabled}
              onChange={(e) => setLunchEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Pause déjeuner (aucun match sur la plage)
          </label>
          <div className={`grid grid-cols-2 gap-3 ${lunchEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            <div className="space-y-1.5">
              <Label>Début pause</Label>
              <Input
                type="time"
                value={lunchStart}
                onChange={(e) => setLunchStart(e.target.value)}
                disabled={!lunchEnabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fin pause</Label>
              <Input
                type="time"
                value={lunchEnd}
                onChange={(e) => setLunchEnd(e.target.value)}
                disabled={!lunchEnabled}
              />
            </div>
          </div>
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
