import { describe, it, expect } from "vitest";
import { projectConfirmedSignups } from "@/lib/needs/confirmed-signups-visibility";
import type { MemberContext } from "@/lib/needs/member-context";

describe("projectConfirmedSignups — invariant 2 (staff-only nominal list)", () => {
  const ids = ["u1", "u2"];
  const names = { u1: "Alice", u2: "Bob" };
  const emptyCtx: MemberContext = {
    primary_role: null,
    player_category: null,
    player_categories: [],
    children: [],
    coached_teams: [],
  };
  const playerCtx: MemberContext = {
    primary_role: "player",
    player_category: "U15",
    player_categories: ["U15"],
    children: [],
    coached_teams: [],
  };
  const parentCtx: MemberContext = {
    primary_role: "parent",
    player_category: null,
    player_categories: [],
    children: [{ name: "Léo M.", category: "U13" }],
    coached_teams: [],
  };

  it("staff : renvoie la liste nominative complète avec context null si non fourni", () => {
    const out = projectConfirmedSignups(true, ids, names);
    expect(out).toEqual([
      { user_id: "u1", full_name: "Alice", context: null },
      { user_id: "u2", full_name: "Bob", context: null },
    ]);
  });

  it("staff avec context : chaque confirmé reçoit son context (joueur / parent)", () => {
    const ctx = new Map<string, MemberContext>([
      ["u1", playerCtx],
      ["u2", parentCtx],
    ]);
    const out = projectConfirmedSignups(true, ids, names, ctx);
    expect(out[0].context?.primary_role).toBe("player");
    expect(out[0].context?.player_categories).toEqual(["U15"]);
    expect(out[1].context?.primary_role).toBe("parent");
    expect(out[1].context?.children[0].name).toBe("Léo M.");
  });

  it("staff avec context absent pour un uid : context=null (jamais l'id)", () => {
    const out = projectConfirmedSignups(true, ["ux"], {}, { ux: emptyCtx });
    expect(out).toEqual([{ user_id: "ux", full_name: null, context: emptyCtx }]);
  });

  it("membre non-staff : renvoie un tableau vide (aucune fuite, même avec context)", () => {
    const ctx = new Map([["u1", playerCtx]]);
    expect(projectConfirmedSignups(false, ids, names, ctx)).toEqual([]);
  });

  it("staff sans confirmés : tableau vide", () => {
    expect(projectConfirmedSignups(true, [], names)).toEqual([]);
  });

  it("staff, nom manquant : full_name = null (jamais l'id)", () => {
    const out = projectConfirmedSignups(true, ["ux"], {});
    expect(out).toEqual([{ user_id: "ux", full_name: null, context: null }]);
  });
});
