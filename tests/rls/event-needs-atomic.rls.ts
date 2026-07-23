/**
 * LOT 1 / Phase A — Tests d'intégration des fonctions atomiques.
 *
 * Couvre les 3 courses/idempotences ajoutées par la migration
 * `publish_event_need_atomic` + `decide_signup_atomic` :
 *
 *  (A) Double-tap publish : deux appels concurrents à
 *      `publish_event_need_atomic` produisent UNE seule publication et le
 *      second retourne `was_idempotent_skip = true`.
 *  (B) Course dernier siège (staff) : deux appels concurrents à
 *      `decide_signup_atomic` (decision='confirm') sur deux candidatures
 *      distinctes du même besoin capacity=1 ne produisent qu'un seul
 *      'confirmed' — l'autre remonte l'erreur `capacity_reached`.
 *  (C) Course dernier siège (apply auto) : deux `apply_to_event_need_atomic`
 *      concurrents sur un besoin auto capacity=1 → un seul 'confirmed',
 *      l'autre reste 'applied' (le RPC atomic existant).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { getFixtures } from "./_setup";

describe("event needs — atomic RPCs (Lot 1 / Phase A consolidation)", () => {
  let publishNeedId: string;
  let confirmNeedId: string;
  let confirmSignup1: string;
  let confirmSignup2: string;
  let autoNeedId: string;
  let cmPlayerA: string;
  let cmParentA: string;

  beforeAll(async () => {
    const fx = getFixtures();

    const { data: cms } = await admin
      .from("club_members")
      .select("id, user_id")
      .eq("club_id", fx.clubA);
    cmPlayerA = cms!.find((r) => r.user_id === fx.users.playerA.userId)!.id;
    cmParentA = cms!.find((r) => r.user_id === fx.users.parentA.userId)!.id;

    async function insertNeed(overrides: Record<string, unknown>) {
      const { data, error } = await admin
        .from("event_needs")
        .insert({
          event_id: fx.eventA,
          club_id: fx.clubA,
          team_id: fx.teamA,
          role_key: "custom",
          label: `__rls_${fx.runId}_atomic`,
          capacity: 1,
          validation_mode: "manual",
          status: "draft",
          created_by: fx.users.adminA.userId,
          ...overrides,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`need insert: ${error?.message}`);
      return data.id as string;
    }

    publishNeedId = await insertNeed({});
    confirmNeedId = await insertNeed({
      status: "open",
      capacity: 1,
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });
    autoNeedId = await insertNeed({
      status: "open",
      capacity: 1,
      validation_mode: "auto",
      first_published_at: new Date().toISOString(),
      last_published_at: new Date().toISOString(),
    });

    // Publications + recipients pour les 2 needs (nécessaire pour apply).
    for (const nid of [confirmNeedId, autoNeedId]) {
      const { data: pub } = await admin
        .from("event_need_publications")
        .insert({ need_id: nid, recipients_count: 2 })
        .select("id")
        .single();
      await admin.from("event_need_publication_recipients").insert([
        { publication_id: pub!.id, member_id: cmPlayerA, user_id: fx.users.playerA.userId },
        { publication_id: pub!.id, member_id: cmParentA, user_id: fx.users.parentA.userId },
      ]);
    }

    // Deux signups 'applied' pour tester la course de confirmation.
    const { data: sig } = await admin
      .from("event_need_signups")
      .insert([
        {
          need_id: confirmNeedId,
          member_id: cmPlayerA,
          user_id: fx.users.playerA.userId,
          status: "applied",
        },
        {
          need_id: confirmNeedId,
          member_id: cmParentA,
          user_id: fx.users.parentA.userId,
          status: "applied",
        },
      ])
      .select("id, user_id");
    confirmSignup1 = sig!.find((s) => s.user_id === fx.users.playerA.userId)!.id;
    confirmSignup2 = sig!.find((s) => s.user_id === fx.users.parentA.userId)!.id;
  });

  afterAll(async () => {
    await admin.from("event_needs").delete().in("id", [publishNeedId, confirmNeedId, autoNeedId]);
  });

  it("(A) double-tap publish → 1 publication + second call flagged idempotent", async () => {
    const fx = getFixtures();
    const audiences = [{ type: "club_admins" }];
    // Deux appels concurrents. Le FOR UPDATE sérialise ; la fenêtre 15 s
    // fait que le second lit last_published_at récent et short-circuite.
    const [r1, r2] = await Promise.all([
      admin.rpc("publish_event_need_atomic", {
        _need_id: publishNeedId,
        _actor: fx.users.adminA.userId,
        _audiences: audiences,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      admin.rpc("publish_event_need_atomic", {
        _need_id: publishNeedId,
        _actor: fx.users.adminA.userId,
        _audiences: audiences,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ]);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    const rows = [
      Array.isArray(r1.data) ? r1.data[0] : r1.data,
      Array.isArray(r2.data) ? r2.data[0] : r2.data,
    ];
    const skipped = rows.filter((r) => r?.was_idempotent_skip);
    const fresh = rows.filter((r) => !r?.was_idempotent_skip);
    expect(fresh).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    // Une seule publication en DB pour ce besoin.
    const { count } = await admin
      .from("event_need_publications")
      .select("*", { count: "exact", head: true })
      .eq("need_id", publishNeedId);
    expect(count).toBe(1);
  });

  it("(B) two staff confirms on last seat → exactly one 'confirmed'", async () => {
    const fx = getFixtures();
    const [r1, r2] = await Promise.all([
      admin.rpc("decide_signup_atomic", {
        _signup_id: confirmSignup1,
        _actor: fx.users.adminA.userId,
        _decision: "confirm",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      admin.rpc("decide_signup_atomic", {
        _signup_id: confirmSignup2,
        _actor: fx.users.adminA.userId,
        _decision: "confirm",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ]);
    // L'un des deux doit ÉCHOUER en capacity_reached.
    const errors = [r1.error, r2.error].filter(Boolean);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/capacity_reached/);
    // DB : exactement 1 signup confirmé sur ce besoin.
    const { count } = await admin
      .from("event_need_signups")
      .select("*", { count: "exact", head: true })
      .eq("need_id", confirmNeedId)
      .eq("status", "confirmed");
    expect(count).toBe(1);
  });

  it("(C) two concurrent applies (auto) on last seat → one 'confirmed', one 'applied'", async () => {
    const fx = getFixtures();
    const [r1, r2] = await Promise.all([
      admin.rpc("apply_to_event_need_atomic", {
        _need_id: autoNeedId,
        _user_id: fx.users.playerA.userId,
        _comment: undefined,
      }),
      admin.rpc("apply_to_event_need_atomic", {
        _need_id: autoNeedId,
        _user_id: fx.users.parentA.userId,
        _comment: undefined,
      }),
    ]);
    // Aucun ne doit ERR (les deux passent, l'un confirmé, l'autre applied).
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
    const { count: confirmedCount } = await admin
      .from("event_need_signups")
      .select("*", { count: "exact", head: true })
      .eq("need_id", autoNeedId)
      .eq("status", "confirmed");
    const { count: appliedCount } = await admin
      .from("event_need_signups")
      .select("*", { count: "exact", head: true })
      .eq("need_id", autoNeedId)
      .eq("status", "applied");
    expect(confirmedCount).toBe(1);
    expect(appliedCount).toBe(1);
  });
});
