import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock, MapPin, Plus, Timer, Trophy } from "lucide-react";
import { computeSchedule, type ScheduleVerdict } from "../lib/planner";
import { cn } from "@/lib/utils";

interface Props {
  /** Optional pre-seed values (used when launched from the AI assistant). */
  initialTeams?: number;
  initialFlights?: boolean;
}

const TEAM_OPTIONS = [8, 12, 16, 24, 32];

const VERDICT_STYLES: Record<ScheduleVerdict, string> = {
  ok: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white",
  warn: "bg-gradient-to-br from-amber-500 to-amber-600 text-white",
  bad: "bg-gradient-to-br from-rose-600 to-rose-700 text-white",
};

export function TournamentSimulator({
  initialTeams = 16,
  initialFlights = false,
}: Props) {
  const { t } = useTranslation("tournaments");
  const [teams, setTeams] = useState(initialTeams);
  const [terrains, setTerrains] = useState(3);
  const [duration, setDuration] = useState(20);
  const [flights, setFlights] = useState(initialFlights);

  const result = useMemo(
    () => computeSchedule({ teams, terrains, durationMin: duration, flights }),
    [teams, terrains, duration, flights],
  );

  const gain = useMemo(() => {
    const more = computeSchedule({
      teams,
      terrains: terrains + 1,
      durationMin: duration,
      flights,
    });
    const baseEnd = parseInt(result.endHHMM.replace(":", ""), 10);
    const moreEnd = parseInt(more.endHHMM.replace(":", ""), 10);
    return Math.max(0, baseEnd - moreEnd);
  }, [teams, terrains, duration, flights, result.endHHMM]);

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
        <div className="mt-2 flex items-end gap-2">
          <div className="text-4xl font-bold tabular-nums">{result.endHHMM}</div>
          <div className="text-sm opacity-90 pb-1.5">{t("simulator.estimatedEnd")}</div>
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
              {result.marginMin >= 0 ? "+" : ""}
              {result.marginMin} min
            </div>
          </div>
        </div>
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
