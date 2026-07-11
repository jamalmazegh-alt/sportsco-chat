/**
 * Support-view — cross-club leak & RLS visibility test.
 *
 * Two independent volets, both required green before exposing the launcher:
 *
 *  1. RLS visibility of the 2 support tables:
 *     - Non-superadmins (adminA, adminB) see 0 rows in support_view_sessions
 *       and support_view_actions.
 *     - Non-superadmins cannot call create_support_view_session.
 *
 *  2. Service-level anti-leak (the real risk — supabaseAdmin bypasses RLS):
 *     - Seed real clubB data (already present via fixtures: eventB, teamB, playerB).
 *     - Create a support session scoped to clubA / adminA (superadmin caller).
 *     - Load the ValidatedSession via the REAL loadValidatedSession path
 *       (so computeTargetPermissions runs for real).
 *     - Call supportDataService.list{Events,Teams,Players} and assert that
 *       NO clubB row surfaces. This is what catches a forgotten WHERE.
 *     - Negative complement: monkey-patch supabaseAdmin.from("events") to
 *       inject a foreign team_id row and assert assertRowsBelongToSession
 *       fires Response(500).
 *
 * DENTS-CHECK (matrice à exécuter manuellement une fois pour prouver que
 * le test a des dents — les deux filets protègent indépendamment) :
 *
 *   filtre `.in("team_id", teamIds)` ON  + `assertRowsBelongToSession` ON
 *     → VERT (baseline).
 *   filtre OFF + guard OFF
 *     → ROUGE : eventB fuit dans listEvents, le seed-and-assert-absent le
 *     détecte. Prouve que le test capte une vraie fuite.
 *   filtre OFF + guard ON
 *     → ROUGE (guard-500) : le guard throw Response(500) sur la ligne clubB.
 *     Prouve que le guard protège seul, sans le WHERE.
 *   filtre ON + guard OFF
 *     → VERT : le WHERE fait le boulot. Attendu, ne prouve rien — NE PAS
 *     attendre du rouge ici.
 *
 * Complément volet 2b : commenter le `throw` dans `assertRowsBelongToSession`
 * → le test « guard fires » tombe rouge. Restaure, il repasse vert.
 *
 * Répéter la même matrice sur `listTeams` (`.eq("club_id", ...)`) et
 * `listPlayers`. Restaurer entre chaque itération.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures, PASSWORD } from "./_setup";
import {
  loadValidatedSession,
  supportDataService,
  assertRowsBelongToSession,
  type ValidatedSession,
} from "@/lib/support-view/service.server";

// ---------------------------------------------------------------------------
// Shared: sign in the superadmin against a fresh client (signInAs cache would
// share the same client across suites — we want an isolated one for the RPC
// calls so ordering is deterministic).
// ---------------------------------------------------------------------------
let superadminClient: SupabaseClient;
let sessionId: string; // admin persona (adminA target)
let validated: ValidatedSession;
let sessionIdParent: string; // parent persona (parentA target)
let validatedParent: ValidatedSession;
let sessionIdCoach: string; // coach persona (coachA target, scope = teamA only)
let validatedCoach: ValidatedSession;
let obligationA_otherFamily: string; // clubA obligation for playerA2 (NOT parentA's child)
let convocationA_otherFamily: string; // clubA convocation for playerA2 (NOT parentA's child)
let otherTeamA: string; // second clubA team, coachA is NOT a member
let otherEventA: string; // event on otherTeamA
let convocationA_otherTeam: string; // convocation on otherTeamA/otherEventA (out of coach scope)

beforeAll(async () => {
  const fx = getFixtures();

  superadminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await superadminClient.auth.signInWithPassword({
    email: fx.users.superadmin.email,
    password: PASSWORD,
  });
  if (signInErr) throw new Error(`superadmin signIn: ${signInErr.message}`);

  // Session #1 — admin persona: target = adminA, club = clubA. Whole-club scope.
  const { data, error } = await superadminClient.rpc(
    "create_support_view_session" as never,
    {
      _target_user_id: fx.users.adminA.userId,
      _club_id: fx.clubA,
      _persona: "club_admin",
      _reason: "rls leak test",
      _duration_minutes: 5,
    } as never,
  );
  if (error || !data) throw new Error(`create_support_view_session admin: ${error?.message}`);
  sessionId = (data as { id: string }).id;
  validated = await loadValidatedSession(superadminClient, fx.users.superadmin.userId, sessionId);

  // Session #2 — parent persona: target = parentA, whose only child is playerA.
  // Used to prove the cross-target intra-club guard: a clubA obligation /
  // convocation belonging to a different family (playerA2) MUST NOT surface.
  const { data: dataP, error: errP } = await superadminClient.rpc(
    "create_support_view_session" as never,
    {
      _target_user_id: fx.users.parentA.userId,
      _club_id: fx.clubA,
      _persona: "parent",
      _reason: "rls cross-target intra-club test",
      _duration_minutes: 5,
    } as never,
  );
  if (errP || !dataP) throw new Error(`create_support_view_session parent: ${errP?.message}`);
  sessionIdParent = (dataP as { id: string }).id;
  validatedParent = await loadValidatedSession(
    superadminClient,
    fx.users.superadmin.userId,
    sessionIdParent,
  );

  // Seed a clubB convocation (fixtures don't have one) so the convocations
  // cross-club leak test has a real foreign row to detect the absence of.
  await admin
    .from("convocations")
    .upsert(
      { event_id: fx.eventB, player_id: fx.playerB, status: "pending" },
      { onConflict: "event_id,player_id" },
    );

  // Seed a clubA obligation for playerA2 (another family, no parent_user link
  // to parentA). Reuses paymentItemA (same clubA item). Without this row, the
  // parent-persona cross-target test would pass trivially (empty = green).
  const { data: poOther, error: poOtherErr } = await admin
    .from("payment_obligations")
    .upsert(
      {
        payment_item_id: (
          await admin
            .from("payment_obligations")
            .select("payment_item_id")
            .eq("id", fx.obligationA)
            .single()
        ).data!.payment_item_id,
        club_id: fx.clubA,
        player_id: fx.playerA2,
        amount_due_cents: 5000,
      },
      { onConflict: "payment_item_id,player_id,payer_user_id" },
    )
    .select("id")
    .single();
  if (poOtherErr || !poOther) {
    throw new Error(`obligation playerA2 seed: ${poOtherErr?.message}`);
  }
  obligationA_otherFamily = poOther.id;

  // Seed a clubA convocation on eventA for playerA2 (another player). parentA's
  // scope is {playerA} only → this row must NOT surface for the parent session.
  const { data: convOther, error: convOtherErr } = await admin
    .from("convocations")
    .upsert(
      { event_id: fx.eventA, player_id: fx.playerA2, status: "pending" },
      { onConflict: "event_id,player_id" },
    )
    .select("id")
    .single();
  if (convOtherErr || !convOther) {
    throw new Error(`convocation playerA2 seed: ${convOtherErr?.message}`);
  }
  convocationA_otherFamily = convOther.id;

  // Session #3 — coach persona: target = coachA. coachA is a coach of teamA
  // only. To prove the cross-team intra-club guard, seed a SECOND team in
  // clubA (coachA is NOT a member), an event on it, and a convocation on
  // that event. The coach session must NOT see it (event_id ∉ scope).
  const { data: dataC, error: errC } = await superadminClient.rpc(
    "create_support_view_session" as never,
    {
      _target_user_id: fx.users.coachA.userId,
      _club_id: fx.clubA,
      _persona: "coach",
      _reason: "rls cross-team intra-club test",
      _duration_minutes: 5,
    } as never,
  );
  if (errC || !dataC) throw new Error(`create_support_view_session coach: ${errC?.message}`);
  sessionIdCoach = (dataC as { id: string }).id;
  validatedCoach = await loadValidatedSession(
    superadminClient,
    fx.users.superadmin.userId,
    sessionIdCoach,
  );

  const { data: otherTeamRow, error: otErr } = await admin
    .from("teams")
    .insert({ club_id: fx.clubA, name: "rls_supportview_otherTeamA", sport: "football" })
    .select("id")
    .single();
  if (otErr || !otherTeamRow) throw new Error(`otherTeamA seed: ${otErr?.message}`);
  otherTeamA = otherTeamRow.id;

  const { data: otherEventRow, error: oeErr } = await admin
    .from("events")
    .insert({
      team_id: otherTeamA,
      title: "rls_supportview_otherEventA",
      starts_at: new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString(),
      type: "training",
      created_by: fx.users.adminA.userId,
      status: "published",
    })
    .select("id")
    .single();
  if (oeErr || !otherEventRow) throw new Error(`otherEventA seed: ${oeErr?.message}`);
  otherEventA = otherEventRow.id;

  const { data: convOtherTeam, error: cotErr } = await admin
    .from("convocations")
    .insert({ event_id: otherEventA, player_id: fx.playerA2, status: "pending" })
    .select("id")
    .single();
  if (cotErr || !convOtherTeam) throw new Error(`otherTeam convocation seed: ${cotErr?.message}`);
  convocationA_otherTeam = convOtherTeam.id;
});

afterAll(async () => {
  const fx = getFixtures();
  for (const sid of [sessionId, sessionIdParent, sessionIdCoach].filter(Boolean)) {
    await superadminClient
      .rpc("end_support_view_session" as never, { _session_id: sid } as never)
      .catch(() => {});
  }
  // Belt-and-braces — global teardown also purges by superadmin_id.
  await admin
    .from("support_view_sessions")
    .delete()
    .eq("superadmin_id", fx.users.superadmin.userId);
  // Local-seeded rows: explicit cleanup (cascades handle FK children).
  if (convocationA_otherFamily) {
    await admin.from("convocations").delete().eq("id", convocationA_otherFamily);
  }
  if (obligationA_otherFamily) {
    await admin.from("payment_obligations").delete().eq("id", obligationA_otherFamily);
  }
  if (convocationA_otherTeam) {
    await admin.from("convocations").delete().eq("id", convocationA_otherTeam);
  }
  if (otherEventA) {
    await admin.from("events").delete().eq("id", otherEventA);
  }
  if (otherTeamA) {
    await admin.from("teams").delete().eq("id", otherTeamA);
  }
});

// ===========================================================================
// VOLET 1 — RLS visibility of support tables
// ===========================================================================
describe("Support-view RLS: table visibility", () => {
  it("adminA cannot see any support_view_sessions row", async () => {
    const c = await signInAs("adminA");
    const { data, error } = await c.from("support_view_sessions").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("adminB cannot see any support_view_sessions row", async () => {
    const c = await signInAs("adminB");
    const { data, error } = await c.from("support_view_sessions").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("adminA cannot see any support_view_actions row", async () => {
    const c = await signInAs("adminA");
    const { data, error } = await c.from("support_view_actions").select("id");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("adminA cannot call create_support_view_session (non-superadmin forbidden)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { error } = await c.rpc(
      "create_support_view_session" as never,
      {
        _target_user_id: fx.users.playerA.userId,
        _club_id: fx.clubA,
        _persona: "player",
        _reason: "should be forbidden",
      } as never,
    );
    expect(error).not.toBeNull();
    expect(String(error?.message ?? "")).toMatch(/forbidden|superadmin/i);
  });

  it("adminB cannot call create_support_view_session either", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    const { error } = await c.rpc(
      "create_support_view_session" as never,
      {
        _target_user_id: fx.users.adminA.userId,
        _club_id: fx.clubA,
        _persona: "club_admin",
        _reason: "should be forbidden",
      } as never,
    );
    expect(error).not.toBeNull();
  });
});

// ===========================================================================
// VOLET 2a — SERVICE anti-leak (seed-and-assert-absent, primary test)
// This is the one that catches a forgotten WHERE in supportDataService,
// because supabaseAdmin bypasses RLS and no policy protects this path.
// ===========================================================================
describe("Support-view service: cross-club leak (real query path)", () => {
  it("listEvents scoped to clubA returns no clubB event", async () => {
    const fx = getFixtures();
    const { events } = await supportDataService.listEvents(validated);
    // eventB exists (fixtures seed it); its team_id = teamB. Assert absent.
    expect(events.length).toBeGreaterThan(0); // sanity: we do see clubA events
    for (const e of events) {
      expect(e.team_id).not.toBe(fx.teamB);
      expect(e.id).not.toBe(fx.eventB);
    }
  });

  it("listTeams scoped to clubA returns no clubB team", async () => {
    const fx = getFixtures();
    const { teams } = await supportDataService.listTeams(validated);
    expect(teams.length).toBeGreaterThan(0);
    for (const t of teams) {
      expect(t.id).not.toBe(fx.teamB);
    }
  });

  it("listPlayers scoped to clubA returns no clubB player", async () => {
    const fx = getFixtures();
    const { players } = await supportDataService.listPlayers(validated);
    expect(players.length).toBeGreaterThan(0);
    for (const p of players) {
      expect(p.id).not.toBe(fx.playerB);
    }
  });

  it("getContextSummary returns clubA identity, not clubB", async () => {
    const fx = getFixtures();
    const ctx = await supportDataService.getContextSummary(validated);
    expect(ctx.club.id).toBe(fx.clubA);
    expect(ctx.club.id).not.toBe(fx.clubB);
    expect(ctx.target.id).toBe(fx.users.adminA.userId);
    expect(ctx.permissions.club_id).toBe(fx.clubA);
  });

  it("listPayments scoped to clubA returns no clubB obligation and no secret fields", async () => {
    const fx = getFixtures();
    const { payments } = await supportDataService.listPayments(validated);
    expect(payments.length).toBeGreaterThan(0); // sanity: obligationA is in clubA
    for (const p of payments) {
      expect(p.id).not.toBe(fx.obligationB);
      // Belt: expurgated DTO must NEVER carry provider tokens or PII fields.
      const forbidden = [
        "stripe_payment_intent_id",
        "stripe_charge_id",
        "external_reference",
        "payer_user_id",
        "exempted_reason",
        "attachment_url",
        "comment",
        "iban",
      ] as const;
      for (const k of forbidden) {
        expect(Object.prototype.hasOwnProperty.call(p, k)).toBe(false);
      }
    }
  });

  it("listConvocations scoped to clubA returns no clubB convocation and no response_token/comment", async () => {
    const fx = getFixtures();
    const { convocations } = await supportDataService.listConvocations(validated);
    expect(convocations.length).toBeGreaterThan(0); // sanity: convocationA is in clubA
    for (const c of convocations) {
      expect(c.event_id).not.toBe(fx.eventB);
      expect(c.player_id).not.toBe(fx.playerB);
      expect(Object.prototype.hasOwnProperty.call(c, "response_token")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(c, "comment")).toBe(false);
    }
  });
});

// ===========================================================================
// VOLET 2a-bis — CROSS-TARGET INTRA-CLUB leak (parent persona)
// The cross-club test above cannot catch this: for parent/player personas,
// the frontier is player_id ∈ own+child, NOT club_id. A guard that only
// checks club_id would let a same-club-different-family row pass. Seeded
// row: obligationA_otherFamily / convocationA_otherFamily (clubA, playerA2,
// no link to parentA). parentA's scope is {playerA} only.
// ===========================================================================
describe("Support-view service: cross-target intra-club leak (parent persona)", () => {
  it("parent session sees only own child's obligations, not another family's", async () => {
    const fx = getFixtures();
    const { payments } = await supportDataService.listPayments(validatedParent);
    // Sanity: must see obligationA (playerA belongs to parentA).
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.some((p) => p.id === fx.obligationA)).toBe(true);
    // Real assertion: playerA2's obligation is in clubA but NOT in scope.
    for (const p of payments) {
      expect(p.id).not.toBe(obligationA_otherFamily);
      expect(p.player_id).toBe(fx.playerA); // ONLY parentA's child
    }
  });

  it("parent session sees only own child's convocations, not another player's", async () => {
    const fx = getFixtures();
    const { convocations } = await supportDataService.listConvocations(validatedParent);
    expect(convocations.length).toBeGreaterThan(0);
    expect(convocations.some((c) => c.id === fx.convocationA)).toBe(true);
    for (const c of convocations) {
      expect(c.id).not.toBe(convocationA_otherFamily);
      expect(c.player_id).toBe(fx.playerA);
    }
  });

  it("coach session sees only convocations of coached teams, not another clubA team", async () => {
    const fx = getFixtures();
    const { convocations } = await supportDataService.listConvocations(validatedCoach);
    // Sanity: coachA is coach of teamA → convocationA (eventA/playerA) is in scope.
    expect(convocations.length).toBeGreaterThan(0);
    expect(convocations.some((c) => c.id === fx.convocationA)).toBe(true);
    // Real assertion: convocationA_otherTeam belongs to a clubA team coachA
    // is NOT part of. Same club_id, different team → must NOT surface.
    for (const c of convocations) {
      expect(c.id).not.toBe(convocationA_otherTeam);
      expect(c.event_id).not.toBe(otherEventA);
    }
  });
});

// ===========================================================================
// VOLET 2b — Guard armed (monkey-patch complement)
// Proves assertRowsBelongToSession is wired on the real code path: injecting
// a foreign row must throw Response(500). This is the belt above the WHERE.
// ===========================================================================
describe("Support-view service: guard fires on injected foreign row", () => {
  it("assertRowsBelongToSession throws when a clubB team_id sneaks in", () => {
    const fx = getFixtures();
    const teamsInScope = new Set([fx.teamA]); // simulate the real scope
    const injected = [{ team_id: fx.teamA }, { team_id: fx.teamB }];
    let thrown: unknown = null;
    try {
      assertRowsBelongToSession(injected, (r) => r.team_id, teamsInScope, "events.team_id");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(500);
  });
});
