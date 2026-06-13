import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, Medal, Award, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MatchLike {
  id: string;
  round: string | null;
  status: string;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  flight_id?: string | null;
}
interface TeamLike {
  id: string;
  name: string;
  logo_url?: string | null;
}
interface FlightLike {
  id: string;
  name: string;
  color?: string | null;
}

interface Props {
  matches: MatchLike[];
  teams: TeamLike[];
  flights: FlightLike[];
  tournamentName: string;
}

interface Podium {
  flightId: string | null;
  flightName: string;
  first?: TeamLike;
  second?: TeamLike;
  third?: TeamLike;
}

function isFinal(round: string | null) {
  return round === "final";
}
function isThird(round: string | null) {
  return round === "third_place" || round === "third";
}

function computePodium(
  flightId: string | null,
  flightName: string,
  matches: MatchLike[],
  teamMap: Map<string, TeamLike>,
): Podium | null {
  const scoped = matches.filter((m) =>
    flightId ? m.flight_id === flightId : !m.flight_id,
  );
  const finalMatch = scoped.find((m) => isFinal(m.round) && m.status === "completed");
  if (!finalMatch) return null;
  const a = finalMatch.team_a_id ? teamMap.get(finalMatch.team_a_id) : undefined;
  const b = finalMatch.team_b_id ? teamMap.get(finalMatch.team_b_id) : undefined;
  const sa = finalMatch.score_a ?? 0;
  const sb = finalMatch.score_b ?? 0;
  const first = sa >= sb ? a : b;
  const second = sa >= sb ? b : a;
  const thirdMatch = scoped.find((m) => isThird(m.round) && m.status === "completed");
  let third: TeamLike | undefined;
  if (thirdMatch) {
    const ta = thirdMatch.team_a_id ? teamMap.get(thirdMatch.team_a_id) : undefined;
    const tb = thirdMatch.team_b_id ? teamMap.get(thirdMatch.team_b_id) : undefined;
    const tsa = thirdMatch.score_a ?? 0;
    const tsb = thirdMatch.score_b ?? 0;
    third = tsa >= tsb ? ta : tb;
  }
  return { flightId, flightName, first, second, third };
}

export function FinalStandings({ matches, teams, flights, tournamentName }: Props) {
  const { t } = useTranslation("tournaments");
  const teamMap = useMemo(() => new Map(teams.map((te) => [te.id, te])), [teams]);

  const podiums = useMemo<Podium[]>(() => {
    if (flights.length > 0) {
      return flights
        .map((f) => computePodium(f.id, f.name, matches, teamMap))
        .filter((p): p is Podium => p !== null);
    }
    const p = computePodium(
      null,
      t("finalStandings.overall", { defaultValue: "Classement final" }),
      matches,
      teamMap,
    );
    return p ? [p] : [];
  }, [flights, matches, teamMap, t]);

  if (podiums.length === 0) return null;

  const allFinalsDone =
    flights.length > 0
      ? flights.every((f) =>
          matches.some(
            (m) => m.flight_id === f.id && isFinal(m.round) && m.status === "completed",
          ),
        )
      : matches.some((m) => isFinal(m.round) && m.status === "completed");

  if (!allFinalsDone) return null;

  const share = async () => {
    const lines = [
      `🏆 ${tournamentName}`,
      "",
      ...podiums.flatMap((p) => [
        flights.length > 0 ? `— ${p.flightName} —` : "",
        p.first ? `🥇 ${p.first.name}` : "",
        p.second ? `🥈 ${p.second.name}` : "",
        p.third ? `🥉 ${p.third.name}` : "",
        "",
      ]),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: tournamentName, text: lines });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(lines);
        toast.success(
          t("finalStandings.copied", { defaultValue: "Classement copié" }),
        );
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <section className="rounded-2xl border border-amber-300/60 bg-gradient-to-b from-amber-50 to-background dark:from-amber-950/20 p-4 space-y-4">
      <header className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-600" />
        <h2 className="text-base font-bold flex-1">
          {t("finalStandings.title", { defaultValue: "Classement final" })}
        </h2>
        <Button size="sm" variant="outline" onClick={share}>
          <Share2 className="h-3.5 w-3.5 mr-1.5" />
          {t("finalStandings.share", { defaultValue: "Partager" })}
        </Button>
      </header>

      <div className="space-y-4">
        {podiums.map((p) => (
          <div key={p.flightId ?? "overall"} className="space-y-2">
            {flights.length > 0 && (
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {p.flightName}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 items-end">
              <PodiumStep
                rank={2}
                team={p.second}
                icon={<Medal className="h-5 w-5 text-slate-400" />}
                heightClass="h-20"
                bgClass="bg-slate-200 dark:bg-slate-700/40"
              />
              <PodiumStep
                rank={1}
                team={p.first}
                icon={<Trophy className="h-6 w-6 text-amber-500" />}
                heightClass="h-28"
                bgClass="bg-amber-200 dark:bg-amber-700/40"
                emphasis
              />
              <PodiumStep
                rank={3}
                team={p.third}
                icon={<Award className="h-5 w-5 text-orange-600" />}
                heightClass="h-16"
                bgClass="bg-orange-200 dark:bg-orange-800/30"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PodiumStep({
  rank,
  team,
  icon,
  heightClass,
  bgClass,
  emphasis,
}: {
  rank: number;
  team?: TeamLike;
  icon: React.ReactNode;
  heightClass: string;
  bgClass: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-col items-center gap-0.5 min-h-[3rem]">
        {icon}
        <span
          className={cn(
            "text-center break-words leading-tight",
            emphasis ? "text-sm font-bold" : "text-xs font-medium",
          )}
        >
          {team?.name ?? "—"}
        </span>
      </div>
      <div
        className={cn(
          "w-full rounded-t-md flex items-start justify-center pt-1.5 font-bold tabular-nums",
          heightClass,
          bgClass,
          emphasis ? "text-lg" : "text-sm",
        )}
      >
        {rank}
      </div>
    </div>
  );
}
