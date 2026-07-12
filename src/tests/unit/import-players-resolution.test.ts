/**
 * Unit tests for the pure resolution helpers used by the players import
 * pipeline (`src/lib/superadmin-import/import.functions.ts`).
 *
 * Focus:
 *  - Team resolution never creates implicitly (override → normalized match →
 *    explicit "create" opt-in → error).
 *  - Normalized matching dedupes casse/accents differences.
 *  - Field patch respects the "no overwrite without explicit opt-in" rule and
 *    the blank-fill contract (with first_name/last_name protected).
 *
 * Cross-tenant authz (teamOverrides pointing at another club, coach of club A
 * targeting club B) is covered server-side by `assertImportAccess` and the
 * dedicated `teamOverrides` validation block in `runImport` — kept out of this
 * pure-helper file on purpose. The authz shape mirrors the existing
 * `src/tests/unit/authz.test.ts` patterns.
 */
import { describe, it, expect } from "vitest";
import {
  _normalizeName,
  computePlayerPatch,
  resolveTeamForRow,
  type FieldSpec,
} from "@/lib/superadmin-import/import.functions";

// =========================================================================
describe("resolveTeamForRow", () => {
  const teamsByNorm = new Map<string, string>([
    // "U13 Filles" / football / u13 → id-1
    [`${_normalizeName("U13 Filles")}|${_normalizeName("football")}|${_normalizeName("U13")}`, "id-1"],
  ]);

  it("returns override when caller pinned a specific team_id", () => {
    const res = resolveTeamForRow({
      equipe: "Anything",
      sport: "football",
      categorie: "U13",
      teamOverrides: { "Anything|football|U13": "id-override" },
      teamsByNorm,
    });
    expect(res).toEqual({ kind: "override", teamKey: "Anything|football|U13", teamId: "id-override" });
  });

  it("matches an existing team when casse/accents differ (normalized)", () => {
    const res = resolveTeamForRow({
      equipe: "u13-filles",
      sport: "FOOTBALL",
      categorie: "u13",
      teamsByNorm,
    });
    expect(res).toEqual({ kind: "matched", teamKey: "u13-filles|FOOTBALL|u13", teamId: "id-1" });
  });

  it("returns 'create' only when the teamKey is explicitly opted in", () => {
    const teamKey = "U15 Garçons|football|U15";
    const res = resolveTeamForRow({
      equipe: "U15 Garçons",
      sport: "football",
      categorie: "U15",
      teamsToCreate: new Set([teamKey]),
      teamsByNorm,
    });
    expect(res).toEqual({ kind: "create", teamKey });
  });

  it("returns an error when the team is unresolved and not opted in — no implicit create", () => {
    const res = resolveTeamForRow({
      equipe: "U15 Garçons",
      sport: "football",
      categorie: "U15",
      teamsByNorm,
    });
    expect(res.kind).toBe("error");
    if (res.kind === "error") expect(res.message).toMatch(/non résolue/);
  });

  it("returns an error when equipe/sport/catégorie missing", () => {
    const res = resolveTeamForRow({
      equipe: "",
      sport: "football",
      categorie: "U13",
      teamsByNorm,
    });
    expect(res.kind).toBe("error");
  });
});

// =========================================================================
describe("computePlayerPatch", () => {
  const baseSpecs = (overrides: Partial<Record<FieldSpec["col"], Partial<FieldSpec>>> = {}): FieldSpec[] => {
    const defaults: Record<FieldSpec["col"], FieldSpec> = {
      first_name: { col: "first_name", incoming: null, current: "Alice", allowBlankFill: false },
      last_name: { col: "last_name", incoming: null, current: "Doe", allowBlankFill: false },
      jersey_number: { col: "jersey_number", incoming: null, current: null, allowBlankFill: true },
      license_number: { col: "license_number", incoming: null, current: null, allowBlankFill: true },
      preferred_position: { col: "preferred_position", incoming: null, current: null, allowBlankFill: true },
      email: { col: "email", incoming: null, current: null, allowBlankFill: true },
      phone: { col: "phone", incoming: null, current: null, allowBlankFill: true },
    };
    for (const [k, v] of Object.entries(overrides)) {
      Object.assign(defaults[k as FieldSpec["col"]], v);
    }
    return Object.values(defaults);
  };

  it("blank-fills empty columns without any opt-in", () => {
    const specs = baseSpecs({ jersey_number: { incoming: 10 }, email: { incoming: "a@b.c" } });
    const patch = computePlayerPatch(specs, new Set());
    expect(patch).toEqual({ jersey_number: 10, email: "a@b.c" });
  });

  it("does NOT overwrite a non-empty column without opt-in (idempotent reimport)", () => {
    const specs = baseSpecs({
      jersey_number: { incoming: 10, current: 7 },
      email: { incoming: "new@x.io", current: "old@x.io" },
    });
    const patch = computePlayerPatch(specs, new Set());
    expect(patch).toEqual({});
  });

  it("overwrites only the fields the caller explicitly opted in", () => {
    const specs = baseSpecs({
      jersey_number: { incoming: 10, current: 7 },
      email: { incoming: "new@x.io", current: "old@x.io" },
    });
    const patch = computePlayerPatch(specs, new Set(["email"]));
    expect(patch).toEqual({ email: "new@x.io" });
  });

  it("never blank-fills first_name / last_name (identity is protected)", () => {
    const specs = baseSpecs({
      first_name: { incoming: "Alicia", current: null },
      last_name: { incoming: "Doe", current: null },
    });
    const patch = computePlayerPatch(specs, new Set());
    expect(patch).toEqual({});
  });

  it("skips overwrite when the incoming value equals the current value", () => {
    const specs = baseSpecs({ jersey_number: { incoming: 7, current: 7 } });
    const patch = computePlayerPatch(specs, new Set(["jersey_number"]));
    expect(patch).toEqual({});
  });
});
