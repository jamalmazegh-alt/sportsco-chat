/**
 * Correction n°1 — assertRowsBelongToSession is the belt against a forgotten
 * `.eq("club_id", ...)` on the RLS-bypassing supabaseAdmin client. Since the
 * whole safety of support-view rests on manual filtering above supabaseAdmin,
 * this guard MUST throw the moment a row falls outside the session's scope.
 */
import { describe, it, expect } from "vitest";
import { assertRowsBelongToSession } from "@/lib/support-view/service.server";

describe("assertRowsBelongToSession", () => {
  it("passes rows whose key is in the allowed set", () => {
    const rows = [{ team_id: "t1" }, { team_id: "t2" }];
    const out = assertRowsBelongToSession(
      rows,
      (r) => r.team_id,
      new Set(["t1", "t2", "t3"]),
      "events.team_id",
    );
    expect(out).toBe(rows);
  });

  it("throws 500 Response when a row is out of scope (RLS bypass leak)", () => {
    const rows = [{ team_id: "t1" }, { team_id: "foreign-team" }];
    try {
      assertRowsBelongToSession(rows, (r) => r.team_id, new Set(["t1"]), "events.team_id");
      throw new Error("guard did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(500);
    }
  });

  it("throws when a row has a null/missing scoping key", () => {
    const rows = [{ club_id: null }];
    expect(() =>
      assertRowsBelongToSession(rows, (r) => r.club_id, "club-A", "players.club_id"),
    ).toThrow();
  });

  it("accepts a scalar allowed value (single-club invariant)", () => {
    const rows = [{ club_id: "club-A" }, { club_id: "club-A" }];
    expect(() =>
      assertRowsBelongToSession(rows, (r) => r.club_id, "club-A", "players.club_id"),
    ).not.toThrow();
  });
});
