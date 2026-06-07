/**
 * FlightsPublicView — vue publique des Flights d'un tournoi.
 * Chaque flight = une carte avec son nom, sa couleur, ses matches
 * sous forme de bracket et le champion (vainqueur de la finale) mis en avant.
 */
import { useTranslation } from "react-i18next";
import { Crown, Trophy } from "lucide-react";
import { BracketView } from "./BracketView";
import { cn } from "@/lib/utils";

interface Flight {
  id: string;
  sort_order: number;
  name: string;
  short_name: string | null;
  color: string | null;
  enable_third_place?: boolean;
}

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
  match_number?: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a_source?: any;
  team_b_source?: any;
  score_a: number | null;
  score_b: number | null;
  status: string;
  winner_team_id?: string | null;
  flight_id?: string | null;
  placement_kind?: string | null;
}

interface Props {
  flights: Flight[];
  matches: Match[];
  teams: Team[];
}

function findChampion(matches: Match[], teams: Team[]): Team | null {
  // Final = match with highest round value containing "final" or last placement_kind=final
  const finals = matches.filter(
    (m) =>
      m.placement_kind === "final" ||
      (typeof m.round === "string" && m.round.toLowerCase().includes("final") && !m.round.toLowerCase().includes("semi") && !m.round.toLowerCase().includes("quarter")),
  );
  const completed = finals.find((m) => m.status === "completed" && m.winner_team_id);
  if (!completed?.winner_team_id) return null;
  return teams.find((t) => t.id === completed.winner_team_id) ?? null;
}

export function FlightsPublicView({ flights, matches, teams }: Props) {
  const { t } = useTranslation("tournaments");

  if (!flights || flights.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("flights.public.empty", { defaultValue: "Aucun flight n'a encore été configuré pour ce tournoi." })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {flights
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((flight) => {
          const flightMatches = matches.filter((m) => m.flight_id === flight.id);
          const champion = findChampion(flightMatches, teams);
          const color = flight.color || "hsl(var(--primary))";

          return (
            <section
              key={flight.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
              style={{ borderTopColor: color, borderTopWidth: 3 }}
            >
              <header className="flex items-center justify-between gap-3 p-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-base truncate">{flight.name}</h3>
                    {flight.short_name && (
                      <p className="text-xs text-muted-foreground">{flight.short_name}</p>
                    )}
                  </div>
                </div>
                {champion && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold shrink-0",
                    )}
                    style={{ backgroundColor: `${color}1a`, color }}
                  >
                    <Crown className="h-4 w-4" />
                    <span className="truncate max-w-[160px]">{champion.name}</span>
                  </div>
                )}
              </header>

              <div className="p-4">
                {flightMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {t("flights.public.noMatches", {
                      defaultValue: "Les matchs de ce flight seront générés après la phase de poules.",
                    })}
                  </p>
                ) : (
                  <BracketView matches={flightMatches as any} teams={teams as any} />
                )}
              </div>
            </section>
          );
        })}
    </div>
  );
}
