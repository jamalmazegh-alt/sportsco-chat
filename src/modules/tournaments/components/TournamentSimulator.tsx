import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Clock, MapPin, Plus, Timer, Trophy, Flag } from "lucide-react";
import {
  computeSchedule,
  formatLunchRange,
  type ScheduleVerdict,
} from "../lib/planner";
import { LUNCH_DURATION_PRESETS } from "../lib/assistant-config";
import { cn } from "@/lib/utils";

interface Props {
  initialTeams?: number;
  initialFlights?: boolean;
}

const TEAM_OPTIONS = [8, 12, 16, 24, 32];

const VERDICT_STYLES: Record<ScheduleVerdict, string> = {
  ok: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white",
  warn: "bg-gradient-to-br from-amber-500 to-amber-600 text-white",
  bad: "bg-gradient-to-br from-rose-600 to-rose-700 text-white",
};

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}
function formatHHMM(min: number): string {
  const t = Math.max(0, Math.round(min));
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function TournamentSimulator({
  initialTeams = 16,
  initialFlights = false,
}: Props) {
  const { t } = useTranslation("tournaments");
  const [startHHMM, setStartHHMM] = useState("09:00");
  const [teams, setTeams] = useState(initialTeams);
  const [terrains, setTerrains] = useState(3);
  const [duration, setDuration] = useState(20);
  const [flights, setFlights] = useState(initialFlights);
  const [lunchDurationMin, setLunchDurationMin] = useState(45);
  const [lunchStart, setLunchStart] = useState("12:30");

  const result = useMemo(
    () =>
      computeSchedule({
        teams,
        terrains,
        durationMin: duration,
        flights,
        startHHMM,
        lunchMin: lunchDurationMin,
        lunchStartHHMM: lunchStart,
      }),
    [teams, terrains, duration, flights, lunchDurationMin, lunchStart, startHHMM],
  );

  // Compute phase end times for the visual timeline.
  const phases = useMemo(() => {
    const startMin = parseHHMM(startHHMM);
    const slot = duration + 3; // same changeover assumption as planner
    const poolRounds = Math.ceil(result.poolMatches / terrains);
    const finalRounds = Math.ceil(result.finalMatches / terrains);
    let poolEnd = startMin + poolRounds * slot;
    // lunch absorbed inside poolEnd if it crosses
    const lunchStartMin = parseHHMM(lunchStart);
    if (
      lunchDurationMin > 0 &&
      startMin < lunchStartMin &&
      poolEnd > lunchStartMin
    ) {
      poolEnd += lunchDurationMin;
    }
    const semiEnd = poolEnd + Math.max(0, finalRounds - 1) * slot;
    const finalEnd = poolEnd + finalRounds * slot;
    const totalMin = finalEnd - startMin;
    return {
      startMin,
      poolEnd,
      semiEnd,
      finalEnd,
      totalMin,
      poolPct: ((poolEnd - startMin) / totalMin) * 100,
      semiPct: ((semiEnd - poolEnd) / totalMin) * 100,
      finalPct: ((finalEnd - semiEnd) / totalMin) * 100,
    };
  }, [
    result.poolMatches,
    result.finalMatches,
    terrains,
    duration,
    startHHMM,
    lunchStart,
    lunchDurationMin,
  ]);

  const gain = useMemo(() => {
    const more = computeSchedule({
      teams,
      terrains: terrains + 1,
      durationMin: duration,
      flights,
      startHHMM,
    });
    const baseEnd = parseInt(result.endHHMM.replace(":", ""), 10);
    const moreEnd = parseInt(more.endHHMM.replace(":", ""), 10);
    return Math.max(0, baseEnd - moreEnd);
  }, [teams, terrains, duration, flights, startHHMM, result.endHHMM]);

  const verdictLabel =
    result.verdict === "ok"
      ? t("simulator.verdictOk")
      : result.verdict === "warn"
        ? t("simulator.verdictWarn")
        : t("simulator.verdictBad");

  return (
    <div className="space-y-5">
      {/* Result hero */}
      <div className={cn("rounded-2xl p-5 transition-colors", VERDICT_STYLES[result.verdict])}>
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">
          {verdictLabel}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] opacity-80">{t("simulator.startTime", { defaultValue: "Début" })}</div>
            <div className="text-2xl font-bold tabular-nums">{startHHMM}</div>
          </div>
          <div className="text-center">
            <div className="text-[11px] opacity-80">{t("simulator.finalAt", { defaultValue: "Finale" })}</div>
            <div className="text-2xl font-bold tabular-nums">{formatHHMM(phases.semiEnd)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] opacity-80">{t("simulator.estimatedEnd")}</div>
            <div className="text-3xl font-bold tabular-nums">{result.endHHMM}</div>
          </div>
        </div>

        {/* Visual timeline */}
        <div className="mt-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="bg-emerald-300/90"
              style={{ width: `${phases.poolPct}%` }}
              title={t("simulator.phasePools", { defaultValue: "Poules" }) as string}
            />
            <div
              className="bg-amber-300/90"
              style={{ width: `${phases.semiPct}%` }}
              title={t("simulator.phaseSemi", { defaultValue: "Demi-finales" }) as string}
            />
            <div
              className="bg-yellow-200"
              style={{ width: `${phases.finalPct}%` }}
              title={t("simulator.phaseFinal", { defaultValue: "Finale" }) as string}
            />
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] font-semibold opacity-90">
            <div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-300" />{t("simulator.phasePools", { defaultValue: "Poules" })}</div>
              <div className="tabular-nums opacity-80">→ {formatHHMM(phases.poolEnd)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-300" />{t("simulator.phaseSemi", { defaultValue: "Demis" })}</div>
              <div className="tabular-nums opacity-80">→ {formatHHMM(phases.semiEnd)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-yellow-200" />{t("simulator.phaseFinal", { defaultValue: "Finale" })}</div>
              <div className="tabular-nums opacity-80">→ {formatHHMM(phases.finalEnd)}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="opacity-80">{t("simulator.matches")}</div>
            <div className="font-semibold text-base">{result.total}</div>
          </div>
          <div>
            <div className="opacity-80">{t("simulator.rounds")}</div>
            <div className="font-semibold text-base">{result.rounds}</div>
          </div>
          <div>
            <div className="opacity-80">{t("simulator.margin")}</div>
            <div className="font-semibold text-base">
              {result.marginMin >= 0 ? "+" : ""}{result.marginMin} min
            </div>
          </div>
        </div>
      </div>

      {/* Start time */}
      <div>
        <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
          <Flag className="h-3.5 w-3.5" /> {t("simulator.startTime", { defaultValue: "Heure de début" })}
        </Label>
        <Input
          type="time"
          value={startHHMM}
          onChange={(e) => setStartHHMM(e.target.value || "09:00")}
          className="mt-2 h-9 w-32 text-sm tabular-nums"
        />
      </div>

      {/* Teams */}
      <div>
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          {t("simulator.teams")}
        </Label>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {TEAM_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTeams(n)}
              className={cn(
                "rounded-lg border py-2.5 text-sm font-bold transition-all",
                teams === n
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Terrains */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {t("simulator.terrains")}
          </Label>
          <span className="text-sm font-bold tabular-nums">{terrains}</span>
        </div>
        <Slider
          value={[terrains]}
          onValueChange={(v) => setTerrains(v[0])}
          min={1}
          max={10}
          step={1}
          className="mt-2"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTerrains((n) => Math.min(10, n + 1))}
          className="mt-2 w-full"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("simulator.addTerrain", { gain })}
        </Button>
      </div>

      {/* Duration */}
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5" /> {t("simulator.duration")}
          </Label>
          <span className="text-sm font-bold tabular-nums">{duration} min</span>
        </div>
        <Slider
          value={[duration]}
          onValueChange={(v) => setDuration(v[0])}
          min={10}
          max={60}
          step={5}
          className="mt-2"
        />
      </div>

      {/* Flights */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-medium">{t("simulator.flights")}</div>
            <div className="text-xs text-muted-foreground">{t("simulator.flightsHint")}</div>
          </div>
        </div>
        <Switch checked={flights} onCheckedChange={setFlights} />
      </div>

      {/* Lunch break */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          {t("simulator.lunch")}
        </Label>
        <div className="flex flex-wrap gap-2">
          {LUNCH_DURATION_PRESETS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => setLunchDurationMin(min)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                lunchDurationMin === min
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-foreground hover:border-primary/50",
              )}
            >
              {min === 0
                ? t("simulator.lunchNone")
                : t("simulator.lunchMin", { min })}
            </button>
          ))}
        </div>
        {lunchDurationMin > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">
              {t("simulator.lunchStart")}
            </Label>
            <Input
              type="time"
              value={lunchStart}
              onChange={(e) => setLunchStart(e.target.value)}
              className="h-8 w-auto text-sm"
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatLunchRange(lunchStart, lunchDurationMin)}
            </span>
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          {t("simulator.breakdown", {
            pools: result.pools,
            perPool: result.perPool,
            poolMatches: result.poolMatches,
            finalMatches: result.finalMatches,
          })}
        </div>
        <div className="opacity-75">{t("simulator.estimateDisclaimer")}</div>
      </div>
    </div>
  );
}
