import { describe, it, expect } from "vitest";
import { projectConfirmedSignups } from "@/lib/needs/confirmed-signups-visibility";

describe("projectConfirmedSignups — invariant 2 (staff-only nominal list)", () => {
  const ids = ["u1", "u2"];
  const names = { u1: "Alice", u2: "Bob" };

  it("staff : renvoie la liste nominative complète", () => {
    const out = projectConfirmedSignups(true, ids, names);
    expect(out).toEqual([
      { user_id: "u1", full_name: "Alice" },
      { user_id: "u2", full_name: "Bob" },
    ]);
  });

  it("membre non-staff : renvoie un tableau vide (les noms ne fuitent pas)", () => {
    const out = projectConfirmedSignups(false, ids, names);
    expect(out).toEqual([]);
  });

  it("staff sans confirmés : tableau vide", () => {
    expect(projectConfirmedSignups(true, [], names)).toEqual([]);
  });

  it("staff, nom manquant : full_name = null (jamais l'id)", () => {
    const out = projectConfirmedSignups(true, ["ux"], {});
    expect(out).toEqual([{ user_id: "ux", full_name: null }]);
  });
});
