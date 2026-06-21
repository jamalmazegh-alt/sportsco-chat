import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, Medal, Award, Share2, Sparkles } from "lucide-react";
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

const GREEN_GRADIENT = "linear-gradient(135deg, #0f4a26 0%, #1d7a45 60%, #2d9d5f 100%)";

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
    <section
      className="relative overflow-hidden rounded-[18px] border-[1.5px] border-emerald-300/50 bg-white dark:bg-card"
      style={{ boxShadow: "0 4px 20px rgba(29,122,69,0.12)" }}
    >
      {/* Hero header — Anime Premium green */}
      <div className="relative overflow-hidden text-white" style={{ background: GREEN_GRADIENT }}>
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
        >
          <defs>
            <radialGradient id="fshalo" cx="80%" cy="0%" r="60%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="400" height="90" fill="url(#fshalo)" />
          <path
            d="M -20 70 L 80 -10 M 40 100 L 180 -10 M 140 100 L 290 -10 M 240 100 L 400 0"
            stroke="#ffffff"
            strokeOpacity="0.22"
            strokeWidth="1.2"
          />
          <g fill="#ffffff" opacity="0.6">
            <rect x="50" y="15" width="3" height="8" transform="rotate(20 50 15)" />
            <rect x="120" y="40" width="3" height="8" transform="rotate(-25 120 40)" />
            <rect x="200" y="20" width="3" height="8" transform="rotate(40 200 20)" />
            <circle cx="280" cy="50" r="2" />
            <circle cx="340" cy="25" r="2" />
          </g>
        </svg>
        <div className="relative flex items-center gap-2.5 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-300 text-amber-950 shadow-md">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-extrabold tracking-tight">
              {t("finalStandings.title", { defaultValue: "Classement final" })}
            </h2>
            <p className="text-[11px] text-white/80 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {t("finalStandings.subtitle", { defaultValue: "Tournoi terminé" })}
            </p>
          </div>
          <Button
            size="sm"
            onClick={share}
            className="h-8 bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/30 backdrop-blur"
          >
            <Share2 className="h-3.5 w-3.5 mr-1.5" />
            {t("finalStandings.share", { defaultValue: "Partager" })}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {podiums.map((p) => (
          <div key={p.flightId ?? "overall"} className="space-y-3">
            {flights.length > 0 && (
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground px-1">
                {p.flightName}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 items-end">
              <PodiumStep
                rank={2}
                team={p.second}
                icon={<Medal className="h-5 w-5 text-slate-500" strokeWidth={2.4} />}
                heightClass="h-20"
                gradient="linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%)"
                ringClass="ring-slate-300"
              />
              <PodiumStep
                rank={1}
                team={p.first}
                icon={<Trophy className="h-6 w-6 text-amber-600" strokeWidth={2.4} />}
                heightClass="h-28"
                gradient="linear-gradient(180deg, #fde68a 0%, #f59e0b 100%)"
                ringClass="ring-amber-400"
                emphasis
              />
              <PodiumStep
                rank={3}
                team={p.third}
                icon={<Award className="h-5 w-5 text-orange-700" strokeWidth={2.4} />}
                heightClass="h-14"
                gradient="linear-gradient(180deg, #fed7aa 0%, #fb923c 100%)"
                ringClass="ring-orange-400"
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
  gradient,
  ringClass,
  emphasis,
}: {
  rank: number;
  team?: TeamLike;
  icon: React.ReactNode;
  heightClass: string;
  gradient: string;
  ringClass: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 animate-fade-in">
      <div className="flex flex-col items-center gap-1 min-h-[3.5rem]">
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-white ring-2 shadow-sm",
            ringClass,
            emphasis ? "h-11 w-11" : "h-9 w-9",
          )}
        >
          {icon}
        </div>
        <span
          className={cn(
            "text-center break-words leading-tight max-w-full px-1",
            emphasis ? "text-[13px] font-extrabold text-foreground" : "text-[11px] font-semibold text-foreground/90",
          )}
        >
          {team?.name ?? "—"}
        </span>
      </div>
      <div
        className={cn(
          "w-full rounded-t-[12px] flex items-start justify-center pt-2 font-black tabular-nums text-white shadow-inner",
          heightClass,
          emphasis ? "text-xl" : "text-base",
        )}
        style={{
          background: gradient,
          textShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }}
      >
        {rank}
      </div>
    </div>
  );
}
