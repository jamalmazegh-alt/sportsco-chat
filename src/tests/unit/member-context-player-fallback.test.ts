import { describe, it, expect } from "vitest";
import { buildMemberContextByUser } from "@/lib/needs/member-context.server";

/**
 * Régression : un joueur rattaché via `players` (user_id + team_members par
 * player_id) mais absent de `team_members` en tant que user_id doit tout de
 * même voir sa catégorie résolue — même chemin que celui utilisé pour les
 * enfants d'un parent.
 */
function makeAdmin(data: {
  teams: Array<{ id: string; name: string; age_group: string | null }>;
  teamMembersByUser: Array<{ team_id: string; user_id: string; role: string }>;
  parentLinks: Array<{ parent_user_id: string; player_id: string }>;
  players: Array<{
    id: string;
    user_id: string | null;
    first_name: string;
    last_name: string;
    club_id: string;
    deleted_at: string | null;
  }>;
  teamMembersByPlayer: Array<{ player_id: string; team_id: string }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    from(table: string) {
      const state: {
        rows: unknown[];
        filters: Array<(r: Record<string, unknown>) => boolean>;
        cols: string[];
      } = { rows: [], filters: [], cols: [] };
      if (table === "teams") state.rows = data.teams;
      else if (table === "player_parents") state.rows = data.parentLinks;
      else if (table === "players") state.rows = data.players;
      const api = {
        select() {
          return api;
        },
        eq(col: string, val: unknown) {
          state.cols.push(col);
          state.filters.push(
            (r) => (r as Record<string, unknown>)[col] === val,
          );
          return api;
        },
        in(col: string, vals: unknown[]) {
          state.cols.push(col);
          const set = new Set(vals);
          state.filters.push((r) =>
            set.has((r as Record<string, unknown>)[col]),
          );
          return api;
        },
        is(col: string, val: unknown) {
          state.cols.push(col);
          state.filters.push(
            (r) => (r as Record<string, unknown>)[col] === val,
          );
          return api;
        },
        then(resolve: (v: { data: unknown[] }) => unknown) {
          let rows: unknown[] = state.rows;
          if (table === "team_members") {
            const usesPlayerId = state.cols.includes("player_id");
            rows = usesPlayerId
              ? data.teamMembersByPlayer
              : data.teamMembersByUser;
          }
          const filtered = (rows as Array<Record<string, unknown>>).filter(
            (r) => state.filters.every((f) => f(r)),
          );
          return Promise.resolve(resolve({ data: filtered }));
        },
      };
      return api;
    },
  };
}

describe("buildMemberContextByUser — fallback players.team_id", () => {
  it("joueur avec user_id dans players + team_members(player_id) mais SANS team_members(user_id) : catégorie résolue", async () => {
    const admin = makeAdmin({
      teams: [{ id: "t-u15", name: "U15 A", age_group: "U15" }],
      teamMembersByUser: [], // <— vide : joueur absent de cette source
      parentLinks: [],
      players: [
        {
          id: "p1",
          user_id: "u-adam",
          first_name: "Adam",
          last_name: "Mercier",
          club_id: "club-1",
          deleted_at: null,
        },
      ],
      teamMembersByPlayer: [{ player_id: "p1", team_id: "t-u15" }],
    });

    const ctx = await buildMemberContextByUser(admin, "club-1", [
      { user_id: "u-adam", roles: ["player"], role: null },
    ]);
    const adam = ctx.get("u-adam");
    expect(adam?.primary_role).toBe("player");
    expect(adam?.player_category).toBe("U15");
    expect(adam?.player_categories).toEqual(["U15"]);
  });
});
