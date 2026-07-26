import { describe, it, expect } from "vitest";
import { summarizeSources } from "@/lib/meetings/attendee-sources";

describe("summarizeSources", () => {
  it("returns [] for non-array input", () => {
    expect(summarizeSources(null)).toEqual([]);
    expect(summarizeSources(undefined)).toEqual([]);
    expect(summarizeSources("nope")).toEqual([]);
    expect(summarizeSources({})).toEqual([]);
  });

  it("maps team sources with and without names", () => {
    const chips = summarizeSources(
      [
        { type: "team_players", team_id: "t1" },
        { type: "team_parents", team_id: "t2" },
      ],
      { teamNameById: { t1: "U15" } },
    );
    expect(chips).toEqual([
      { key: "team:t1", kind: "team", label: "U15" },
      { key: "team:t2", kind: "team", label: "équipe" },
    ]);
  });

  it("maps group sources with and without names", () => {
    const chips = summarizeSources(
      [
        { type: "club_group", group_id: "g1" },
        { type: "club_group", group_id: "g2" },
      ],
      { groupNameById: { g1: "Bureau" } },
    );
    expect(chips.map((c) => c.label)).toEqual(["Bureau", "groupe"]);
  });

  it("maps manual additions", () => {
    const chips = summarizeSources([{ type: "manual" }]);
    expect(chips).toEqual([{ key: "manual", kind: "manual", label: "ajouté manuellement" }]);
  });

  it("maps creator (organisateur)", () => {
    const chips = summarizeSources([{ type: "creator" }]);
    expect(chips).toEqual([{ key: "creator", kind: "manual", label: "organisateur" }]);
  });

  it("groups club audiences under the club kind", () => {
    const chips = summarizeSources([{ type: "club_educators" }, { type: "club_admins" }]);
    expect(chips.map((c) => c.kind)).toEqual(["club", "club"]);
    expect(chips.every((c) => c.label === "club")).toBe(true);
  });

  it("dedupes identical sources", () => {
    const chips = summarizeSources([
      { type: "team_players", team_id: "t1" },
      { type: "team_players", team_id: "t1" },
      { type: "manual" },
      { type: "manual" },
    ]);
    expect(chips).toHaveLength(2);
  });

  it("ignores descriptors without type", () => {
    const chips = summarizeSources([{ team_id: "t1" }, {}, null, { type: "manual" }]);
    expect(chips).toEqual([{ key: "manual", kind: "manual", label: "ajouté manuellement" }]);
  });

  it("maps category_educators", () => {
    const chips = summarizeSources([{ type: "category_educators", category: "U15" }]);
    expect(chips).toEqual([{ key: "cat:U15", kind: "category", label: "U15" }]);
  });
});
