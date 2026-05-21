/**
 * BracketView — affichage visuel d'un bracket à élimination directe.
 * Rendu par colonnes (1 colonne = 1 tour) avec lignes de connexion CSS.
 */
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
}

interface Match {
  id: string;
  round: string;
  bracket_position: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  status: string;
  winner_team_id?: string | null;
}

interface Props {
  matches: Match[];
  teams: Team[];
}

const ROUND_ORDER = ["r32", "r16", "qf", "sf", "final"];
const ROUND_LABELS: Record<string, string> = {
  r32: "32es",
  r16: "8es",
  qf: "Quarts",
  sf: "Demis",
  final: "Finale",
  third_place: "3e place",
};

export function BracketView({ matches, teams }: Props) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const knockout = matches.filter((m) => m.round !== "group");
  if (knockout.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Aucun bracket généré pour le moment.
      </div>
    );
  }

  const byRound = new Map<string, Match[]>();
  for (const m of knockout) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  for (const arr of byRound.values()) {
    arr.sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0));
  }
  const rounds = ROUND_ORDER.filter((r) => byRound.has(r));
  const thirdPlace = byRound.get("third_place");

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-fit">
          {rounds.map((r) => {
            const ms = byRound.get(r) ?? [];
            return (
              <div key={r} className="flex flex-col gap-3 min-w-[180px]">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                  {ROUND_LABELS[r] ?? r}
                </div>
                <div className="flex flex-col gap-3 justify-around flex-1">
                  {ms.map((m) => (
                    <BracketMatch key={m.id} match={m} teamMap={teamMap} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {thirdPlace && thirdPlace.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Match pour la 3e place
          </div>
          <div className="max-w-[200px]">
            <BracketMatch match={thirdPlace[0]} teamMap={teamMap} />
          </div>
        </div>
      )}
    </div>
  );
}

function BracketMatch({
  match,
  teamMap,
}: {
  match: Match;
  teamMap: Map<string, Team>;
}) {
  const a = match.team_a_id ? teamMap.get(match.team_a_id) : undefined;
  const b = match.team_b_id ? teamMap.get(match.team_b_id) : undefined;
  const winner = match.winner_team_id;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden text-sm shadow-sm">
      <Side
        team={a}
        score={match.score_a}
        isWinner={winner === match.team_a_id}
        status={match.status}
      />
      <div className="h-px bg-border" />
      <Side
        team={b}
        score={match.score_b}
        isWinner={winner === match.team_b_id}
        status={match.status}
      />
    </div>
  );
}

function Side({
  team,
  score,
  isWinner,
  status,
}: {
  team?: Team;
  score: number | null;
  isWinner: boolean;
  status: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 py-2",
        isWinner && "bg-primary/5",
      )}
    >
      <span
        className={cn(
          "truncate",
          isWinner ? "font-semibold" : "text-foreground/80",
          !team && "italic text-muted-foreground",
        )}
      >
        {team?.name ?? "À déterminer"}
      </span>
      <span
        className={cn(
          "tabular-nums text-xs px-1.5 py-0.5 rounded",
          status === "completed" && isWinner && "bg-primary text-primary-foreground font-bold",
          status === "completed" && !isWinner && "text-muted-foreground",
          status !== "completed" && "text-muted-foreground",
        )}
      >
        {score ?? "–"}
      </span>
    </div>
  );
}
