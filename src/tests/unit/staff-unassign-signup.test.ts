/**
 * staffUnassignSignup — retrait par le staff d'une candidature confirmée.
 *
 * Invariants vérifiés (maquette S4-2) :
 *  - statut = "declined" (pas "withdrawn" : withdrawn = « s'est désisté »)
 *  - decided_by = ID du staff qui a retiré
 *  - une (et une seule) notification "unassign" à l'ex-assigné
 *  - couverture recalculée pour l'événement (place libérée)
 */
import { describe, it, expect, vi } from "vitest";
import { _staffUnassignSignupImpl } from "@/lib/needs/needs.functions";

function makeDeps(overrides?: { signupStatus?: string; isStaff?: boolean }) {
  const updates: any[] = [];
  const notifyCalls: any[] = [];
  const recomputeCalls: string[] = [];

  const signup = {
    id: "signup-1",
    need_id: "need-1",
    user_id: "adam-user",
    status: overrides?.signupStatus ?? "confirmed",
    event_needs: { club_id: "club-1", event_id: "event-1" },
  };

  const supabaseAdmin = {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: signup, error: null }),
        }),
      }),
      update: (patch: any) => ({
        eq: async (_col: string, _id: string) => {
          updates.push(patch);
          return { error: null };
        },
      }),
    }),
  };
  const supabase = {
    rpc: async (_name: string, _args: any) => ({
      data: overrides?.isStaff ?? true,
    }),
  };
  const recomputeCoverage = async (eventId: string) => {
    recomputeCalls.push(eventId);
  };
  const notify = async (p: any) => {
    notifyCalls.push(p);
  };
  return {
    supabase,
    supabaseAdmin,
    recomputeCoverage,
    notify,
    updates,
    notifyCalls,
    recomputeCalls,
  };
}

describe("staffUnassignSignup", () => {
  it("retrait d'un confirmé → declined, decided_by, une notif unassign, couverture recalculée", async () => {
    const d = makeDeps();
    const res = await _staffUnassignSignupImpl({
      signupId: "signup-1",
      actorUserId: "staff-user",
      supabase: d.supabase,
      supabaseAdmin: d.supabaseAdmin,
      recomputeCoverage: d.recomputeCoverage,
      notify: d.notify,
      now: () => "2026-07-19T10:00:00.000Z",
    });

    expect(res).toEqual({ ok: true, already: false });

    // 1. Update : status=declined (pas withdrawn), decided_by=staff, timestamps propres
    expect(d.updates).toHaveLength(1);
    expect(d.updates[0]).toEqual({
      status: "declined",
      declined_at: "2026-07-19T10:00:00.000Z",
      confirmed_at: null,
      withdrawn_at: null,
      decided_by: "staff-user",
    });
    expect(d.updates[0].status).not.toBe("withdrawn");

    // 2. Une notification et une seule, ciblant l'ex-assigné, type "unassign"
    expect(d.notifyCalls).toHaveLength(1);
    expect(d.notifyCalls[0]).toEqual({
      needId: "need-1",
      signupId: "signup-1",
      decision: "unassign",
      applicantUserId: "adam-user",
    });

    // 3. Couverture recalculée (place libérée)
    expect(d.recomputeCalls).toEqual(["event-1"]);
  });

  it("no-op si le signup n'est pas confirmed (pas d'update, pas de notif)", async () => {
    const d = makeDeps({ signupStatus: "applied" });
    const res = await _staffUnassignSignupImpl({
      signupId: "signup-1",
      actorUserId: "staff-user",
      supabase: d.supabase,
      supabaseAdmin: d.supabaseAdmin,
      recomputeCoverage: d.recomputeCoverage,
      notify: d.notify,
    });
    expect(res).toEqual({ ok: true, already: true });
    expect(d.updates).toHaveLength(0);
    expect(d.notifyCalls).toHaveLength(0);
    expect(d.recomputeCalls).toHaveLength(0);
  });

  it("refuse si l'utilisateur n'est pas staff du club", async () => {
    const d = makeDeps({ isStaff: false });
    await expect(
      _staffUnassignSignupImpl({
        signupId: "signup-1",
        actorUserId: "not-staff",
        supabase: d.supabase,
        supabaseAdmin: d.supabaseAdmin,
        recomputeCoverage: d.recomputeCoverage,
        notify: d.notify,
      }),
    ).rejects.toThrow("forbidden");
    expect(d.updates).toHaveLength(0);
    expect(d.notifyCalls).toHaveLength(0);
  });

  it("un échec de notification n'annule pas le retrait (best-effort)", async () => {
    const d = makeDeps();
    const failingNotify = vi.fn(async () => {
      throw new Error("push provider down");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await _staffUnassignSignupImpl({
      signupId: "signup-1",
      actorUserId: "staff-user",
      supabase: d.supabase,
      supabaseAdmin: d.supabaseAdmin,
      recomputeCoverage: d.recomputeCoverage,
      notify: failingNotify,
      now: () => "2026-07-19T10:00:00.000Z",
    });
    expect(res).toEqual({ ok: true, already: false });
    expect(d.updates[0].status).toBe("declined");
    expect(failingNotify).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
