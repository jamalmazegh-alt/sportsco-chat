import { describe, it, expect } from "vitest";
import {
  sourcesToSelection,
  type AttendeeForSelection,
} from "@/lib/meetings/sources-to-selection";

const att = (partial: Partial<AttendeeForSelection>): AttendeeForSelection => ({
  user_id: partial.user_id ?? "u",
  full_name: partial.full_name ?? null,
  added_manually: partial.added_manually ?? false,
  sources: partial.sources ?? [],
});

describe("sourcesToSelection", () => {
  it("entrée vide → objet vide/défaut", () => {
    const s = sourcesToSelection([]);
    expect(s.scalar?.size ?? 0).toBe(0);
    expect(s.groupIds?.size ?? 0).toBe(0);
    expect(s.teamPicks).toEqual([]);
    expect(s.category).toBe("");
    expect(s.preassigned).toEqual([]);
  });

  it("null/undefined toléré", () => {
    expect(sourcesToSelection(null).groupIds?.size ?? 0).toBe(0);
    expect(sourcesToSelection(undefined).teamPicks).toEqual([]);
  });

  it("groupe → groupIds", () => {
    const s = sourcesToSelection([
      att({ user_id: "u1", sources: [{ type: "club_group", group_id: "g1" }] }),
    ]);
    expect([...(s.groupIds ?? [])]).toEqual(["g1"]);
  });

  it("équipe → teamPicks avec kind", () => {
    const s = sourcesToSelection([
      att({ user_id: "u1", sources: [{ type: "team_players", team_id: "t1" }] }),
    ]);
    expect(s.teamPicks).toEqual([{ team_id: "t1", kind: "team_players" }]);
  });

  it("added_manually → preassigned sans doublon", () => {
    const s = sourcesToSelection([
      att({ user_id: "u1", full_name: "A", added_manually: true }),
      att({ user_id: "u1", full_name: "A", added_manually: true }),
    ]);
    expect(s.preassigned).toEqual([{ user_id: "u1", full_name: "A" }]);
  });

  it("union de plusieurs convoqués agrège toutes les sources", () => {
    const s = sourcesToSelection([
      att({ user_id: "u1", sources: [{ type: "club_group", group_id: "g1" }] }),
      att({
        user_id: "u2",
        sources: [
          { type: "team_players", team_id: "t1" },
          { type: "category_educators", category: "U15" },
          { type: "club_members" },
        ],
      }),
    ]);
    expect([...(s.groupIds ?? [])]).toEqual(["g1"]);
    expect(s.teamPicks).toEqual([{ team_id: "t1", kind: "team_players" }]);
    expect(s.category).toBe("U15");
    expect(s.scalar?.has("club_members")).toBe(true);
  });

  it("descripteurs manual ignorés dans les selectors", () => {
    const s = sourcesToSelection([
      att({ user_id: "u1", added_manually: true, sources: [{ type: "manual" }] }),
    ]);
    expect(s.groupIds?.size ?? 0).toBe(0);
    expect(s.teamPicks).toEqual([]);
    expect(s.preassigned).toEqual([{ user_id: "u1", full_name: null }]);
  });

  it("déduplication des équipes", () => {
    const s = sourcesToSelection([
      att({ user_id: "u1", sources: [{ type: "team_players", team_id: "t1" }] }),
      att({ user_id: "u2", sources: [{ type: "team_players", team_id: "t1" }] }),
    ]);
    expect(s.teamPicks).toEqual([{ team_id: "t1", kind: "team_players" }]);
  });
});
