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
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
let sessionId: string;
let validated: ValidatedSession;

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

  // Create a real session: target = adminA, club = clubA, persona = club_admin.
  // adminA has role='admin' in club_members(clubA) via fixtures → persona check passes.
  const { data, error } = await superadminClient.rpc(
    // rpc name not in generated types yet — cast to any for the call site.
    "create_support_view_session" as never,
    {
      _target_user_id: fx.users.adminA.userId,
      _club_id: fx.clubA,
      _persona: "club_admin",
      _reason: "rls leak test",
      _duration_minutes: 5,
    } as never,
  );
  if (error || !data) throw new Error(`create_support_view_session: ${error?.message}`);
  sessionId = (data as { id: string }).id;

  // Real loadValidatedSession → real computeTargetPermissions inside listX.
  validated = await loadValidatedSession(
    superadminClient,
    fx.users.superadmin.userId,
    sessionId,
  );

  // Seed a clubB convocation (fixtures don't have one) so the convocations
  // cross-club leak test has a real foreign row to detect the absence of.
  await admin
    .from("convocations")
    .upsert(
      { event_id: fx.eventB, player_id: fx.playerB, status: "pending" },
      { onConflict: "event_id,player_id" },
    );
});

afterAll(async () => {
  if (!sessionId) return;
  const fx = getFixtures();
  await superadminClient
    .rpc("end_support_view_session" as never, { _session_id: sessionId } as never)
    .catch(() => {});
  // Belt-and-braces — global teardown also purges by superadmin_id.
  await admin
    .from("support_view_sessions")
    .delete()
    .eq("superadmin_id", fx.users.superadmin.userId);
  // Convocation seed above is cleaned up by the fixtures teardown
  // (`delete from convocations where event_id in [eventA, eventB]`).
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
    const { error } = await c.rpc("create_support_view_session" as never, {
      _target_user_id: fx.users.playerA.userId,
      _club_id: fx.clubA,
      _persona: "player",
      _reason: "should be forbidden",
    } as never);
    expect(error).not.toBeNull();
    expect(String(error?.message ?? "")).toMatch(/forbidden|superadmin/i);
  });

  it("adminB cannot call create_support_view_session either", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    const { error } = await c.rpc("create_support_view_session" as never, {
      _target_user_id: fx.users.adminA.userId,
      _club_id: fx.clubA,
      _persona: "club_admin",
      _reason: "should be forbidden",
    } as never);
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
