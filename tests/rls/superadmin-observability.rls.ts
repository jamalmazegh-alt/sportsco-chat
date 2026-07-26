/**
 * RLS: superadmin observability RPCs.
 *
 * The 6 SECURITY DEFINER RPCs backing the superadmin observability surfaces
 * MUST refuse any non-super-admin caller at the SQL layer, independent of the
 * TS server-fn guard. A direct PostgREST call by an authenticated user
 * (parent, coach, adminA…) must raise `forbidden` — not return empty rows.
 */
import { describe, it, expect } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures, type Role } from "./_setup";

const NON_SUPER_ROLES: Role[] = ["adminA", "coachA", "parentA", "playerA"];

const RPCS: Array<{
  name: string;
  args: (fx: ReturnType<typeof getFixtures>) => Record<string, unknown>;
}> = [
  {
    name: "superadmin_invite_batches",
    args: () => ({ _template: null, _club_id: null, _from: null, _to: null, _limit: 10 }),
  },
  { name: "superadmin_invite_batch_rows", args: () => ({ _batch_id: "any" }) },
  {
    name: "superadmin_notifications_emails",
    args: () => ({
      _template: null,
      _status: null,
      _from: null,
      _to: null,
      _search: null,
      _limit: 10,
      _offset: 0,
    }),
  },
  {
    name: "superadmin_notifications_push",
    args: () => ({ _kind: null, _from: null, _to: null, _limit: 10, _offset: 0 }),
  },
  { name: "superadmin_club_roster", args: (fx) => ({ _club_id: fx.clubA }) },
  { name: "superadmin_player_audit", args: (fx) => ({ _player_id: fx.playerA, _limit: 10 }) },
];

describe("RLS: superadmin_* RPCs refuse non-super callers", () => {
  for (const role of NON_SUPER_ROLES) {
    for (const rpc of RPCS) {
      it(`${role} calling ${rpc.name} → forbidden`, async () => {
        const fx = getFixtures();
        const c = await signInAs(role);
        const { data, error } = await (c.rpc as any)(rpc.name, rpc.args(fx));
        expect(
          error,
          `expected ${role} → ${rpc.name} to be refused; got data=${JSON.stringify(data)?.slice(0, 120)}`,
        ).toBeTruthy();
        // Match either the SQLSTATE (42501) or the message ("forbidden").
        const msg = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
        expect(msg).toMatch(/42501|forbidden|permission/);
      });
    }
  }

  it("superadmin can call every superadmin_* RPC without error", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    for (const rpc of RPCS) {
      const { error } = await (c.rpc as any)(rpc.name, rpc.args(fx));
      // Empty rowsets are fine; PL/pgSQL RETURNS TABLE clashes (e.g. ambiguous
      // message_id) and forbidden must both fail the suite.
      expect(error, `superadmin → ${rpc.name}: ${error?.message ?? "ok"}`).toBeNull();
    }
  });
});
