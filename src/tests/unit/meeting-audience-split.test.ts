import { describe, it, expect } from "vitest";
import { splitAudiences, type AudienceLike } from "@/lib/meetings/audience-split";

const g = (group_id: string): AudienceLike => ({ type: "club_group", group_id });
const team = (team_id: string): AudienceLike => ({ type: "team_players", team_id });
const selected = (...user_ids: string[]): AudienceLike => ({ type: "selected_members", user_ids });

describe("splitAudiences", () => {
  it("garde les sélecteurs purs et n'extrait aucun user manuel", () => {
    const { selectors, manualUserIds } = splitAudiences([g("grp-1"), team("team-1")]);
    expect(selectors).toHaveLength(2);
    expect(manualUserIds).toEqual([]);
  });

  it("extrait les user_ids des sélecteurs selected_members", () => {
    const { selectors, manualUserIds } = splitAudiences([g("grp-1"), selected("u1", "u2")]);
    expect(selectors).toHaveLength(1);
    expect(selectors[0]).toMatchObject({ type: "club_group" });
    expect(manualUserIds.sort()).toEqual(["u1", "u2"]);
  });

  it("fusionne les ajouts manuels explicites avec selected_members et déduplique", () => {
    const { manualUserIds } = splitAudiences([selected("u1", "u2")], ["u2", "u3"]);
    expect(manualUserIds.sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("déduplique un même user présent dans plusieurs selected_members", () => {
    const { manualUserIds } = splitAudiences([selected("u1"), selected("u1", "u4")]);
    expect(manualUserIds.sort()).toEqual(["u1", "u4"]);
  });

  it("ignore les entrées vides / non-string et les audiences nulles", () => {
    const { selectors, manualUserIds } = splitAudiences(
      [g("grp-1"), { type: "selected_members", user_ids: ["u1", "", 42 as unknown as string] }],
      ["", "u9"],
    );
    expect(selectors).toHaveLength(1);
    expect(manualUserIds.sort()).toEqual(["u1", "u9"]);
  });

  it("tolère une liste d'audiences null/undefined", () => {
    expect(splitAudiences(null)).toEqual({ selectors: [], manualUserIds: [] });
    expect(splitAudiences(undefined, ["u1"])).toEqual({ selectors: [], manualUserIds: ["u1"] });
  });
});
