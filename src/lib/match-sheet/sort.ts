/**
 * Pure ordering for the match sheet roster.
 *
 * Rule (V1):
 *   1. Players with a jersey number sorted by jersey number ascending.
 *   2. Players without a jersey number appended, sorted by last name (locale-aware).
 *
 * Kept in its own module so it can be unit-tested without any DB/PDF deps.
 */
export interface MatchSheetPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  jersey_number: number | null;
  birth_date: string | null;
  license_number: string | null;
}

export function sortConvocatedPlayers<T extends MatchSheetPlayer>(players: readonly T[]): T[] {
  const withNumber: T[] = [];
  const withoutNumber: T[] = [];
  for (const p of players) {
    if (typeof p.jersey_number === "number" && Number.isFinite(p.jersey_number)) {
      withNumber.push(p);
    } else {
      withoutNumber.push(p);
    }
  }
  withNumber.sort((a, b) => (a.jersey_number ?? 0) - (b.jersey_number ?? 0));
  withoutNumber.sort((a, b) => {
    const an = (a.last_name ?? "").trim();
    const bn = (b.last_name ?? "").trim();
    return an.localeCompare(bn, undefined, { sensitivity: "base" });
  });
  return [...withNumber, ...withoutNumber];
}
