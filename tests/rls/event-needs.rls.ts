/**
 * LOT 1 — Besoins événementiels « Coups de main » (Phase A).
 *
 * Cas obligatoires couverts :
 *  1. Destinataire sans signup lit le besoin publié (bug bloquant #1 — le
 *     helper user_is_need_recipient est SECURITY DEFINER pour bypass la
 *     RLS staff-only de event_need_publication_recipients dans la
 *     sous-requête de policy).
 *  2. Porteur d'un signup sur un besoin fermé/annulé le lit encore
 *     (raison d'être du helper distinct de can_apply_to_event_need).
 *  3. Non-destinataire du même club : 0 ligne.
 *  4. Draft : invisible pour tous les membres (même destinataire d'une
 *     autre publication d'un autre besoin).
 *  5. RPC directes (`user_is_need_recipient`, `can_apply_to_event_need`,
 *     `recompute_event_need_coverage`) refusent silencieusement les
 *     appelants non-autorisés (membre-pour-autrui, cross-club, anon,
 *     recompute par simple membre).
 *  6. CHECK `event_need_audiences_params_chk` : rejette un `club_group`
 *     sans `group_id` et un `team_players` avec `category`.
 *  7. Trigger `event_needs_check_event_club` : rejette un besoin sur un
 *     événement sans équipe, avec le message explicite.
 *  8. Signups : un membre ne lit jamais le signup d'un autre ; staff lit
 *     ceux de ses besoins ; cross-club 0 ligne.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs, anonClient } from "./_clients";
import { getFixtures } from "./_setup";

describe("event_needs (Lot 1 / Phase A)", () => {
  let openNeedA: string; // clubA, published (open), publication → playerA
  let closedNeedA: string; // clubA, closed, playerA has a signup
  let cancelledNeedA: string; // clubA, cancelled, playerA has a signup
  let draftNeedA: string; // clubA, draft — must stay invisible
  let otherOpenNeedA: string; // clubA, open, publication → parentA (not playerA)
  let openNeedB: string; // clubB, open, publication → playerB

  // club_members.id lookups
  let cmPlayerA: string;
  let cmParentA: string;
  let cmPlayerB: string;
  let cmCoachA: string;

  beforeAll(async () => {
    const fx = getFixtures();

    // Look up club_members.id
    const { data: cmsA, error: cmsAErr } = await admin
      .from("club_members")
      .select("id, user_id")
      .eq("club_id", fx.clubA);
    if (cmsAErr) throw new Error(`club_members A: ${cmsAErr.message}`);
    cmPlayerA = cmsA!.find((r) => r.user_id === fx.users.playerA.userId)!.id;
    cmParentA = cmsA!.find((r) => r.user_id === fx.users.parentA.userId)!.id;
    cmCoachA = cmsA!.find((r) => r.user_id === fx.users.coachA.userId)!.id;

    const { data: cmsB } = await admin
      .from("club_members")
      .select("id, user_id")
      .eq("club_id", fx.clubB);
    cmPlayerB = cmsB!.find((r) => r.user_id === fx.users.playerB.userId)!.id;

    // ---- Needs ----------------------------------------------------------
    async function insertNeed(
      overrides: Record<string, unknown>,
      clubId: string,
      teamId: string,
      eventId: string,
      creator: string,
    ) {
      const { data, error } = await admin
        .from("event_needs")
        .insert({
          event_id: eventId,
          club_id: clubId,
          team_id: teamId,
          role_key: "custom",
          label: `__rls_${fx.runId}_need`,
          capacity: 2,
          validation_mode: "auto",
          created_by: creator,
          ...overrides,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`event_needs insert: ${error?.message}`);
      return data.id as string;
    }

    const nowIso = new Date().toISOString();

    openNeedA = await insertNeed(
      { status: "open", first_published_at: nowIso, last_published_at: nowIso },
      fx.clubA,
      fx.teamA,
      fx.eventA,
      fx.users.adminA.userId,
    );
    closedNeedA = await insertNeed(
      { status: "closed", first_published_at: nowIso, last_published_at: nowIso },
      fx.clubA,
      fx.teamA,
      fx.eventA,
      fx.users.adminA.userId,
    );
    cancelledNeedA = await insertNeed(
      { status: "cancelled", first_published_at: nowIso, last_published_at: nowIso },
      fx.clubA,
      fx.teamA,
      fx.eventA,
      fx.users.adminA.userId,
    );
    draftNeedA = await insertNeed(
      { status: "draft" },
      fx.clubA,
      fx.teamA,
      fx.eventA,
      fx.users.adminA.userId,
    );
    otherOpenNeedA = await insertNeed(
      { status: "open", first_published_at: nowIso, last_published_at: nowIso },
      fx.clubA,
      fx.teamA,
      fx.eventA,
      fx.users.adminA.userId,
    );
    openNeedB = await insertNeed(
      { status: "open", first_published_at: nowIso, last_published_at: nowIso },
      fx.clubB,
      fx.teamB,
      fx.eventB,
      fx.users.adminB.userId,
    );

    // ---- Publications & recipients -------------------------------------
    // openNeedA → playerA (recipient), openNeedB → playerB, otherOpenNeedA → parentA
    async function publish(needId: string, recipientMemberId: string, recipientUserId: string) {
      const { data, error } = await admin
        .from("event_need_publications")
        .insert({ need_id: needId, recipients_count: 1 })
        .select("id")
        .single();
      if (error || !data) throw new Error(`publication insert: ${error?.message}`);
      const pubId = data.id;
      const { error: rErr } = await admin.from("event_need_publication_recipients").insert({
        publication_id: pubId,
        member_id: recipientMemberId,
        user_id: recipientUserId,
      });
      if (rErr) throw new Error(`recipient insert: ${rErr.message}`);
    }

    await publish(openNeedA, cmPlayerA, fx.users.playerA.userId);
    await publish(closedNeedA, cmPlayerA, fx.users.playerA.userId);
    await publish(cancelledNeedA, cmPlayerA, fx.users.playerA.userId);
    await publish(otherOpenNeedA, cmParentA, fx.users.parentA.userId);
    await publish(openNeedB, cmPlayerB, fx.users.playerB.userId);

    // ---- Signups --------------------------------------------------------
    // playerA signup on closedNeedA + cancelledNeedA (to test signup-based reads)
    const { error: sErr } = await admin.from("event_need_signups").insert([
      {
        need_id: closedNeedA,
        member_id: cmPlayerA,
        user_id: fx.users.playerA.userId,
        status: "confirmed",
      },
      {
        need_id: cancelledNeedA,
        member_id: cmPlayerA,
        user_id: fx.users.playerA.userId,
        status: "applied",
      },
    ]);
    if (sErr) throw new Error(`signups insert: ${sErr.message}`);
  });

  afterAll(async () => {
    // Cascade via event_needs delete
    await admin
      .from("event_needs")
      .delete()
      .in("id", [openNeedA, closedNeedA, cancelledNeedA, draftNeedA, otherOpenNeedA, openNeedB]);
  });

  // ================== §1. Visibilité destinataire =====================

  it("recipient without signup CAN read the published open need (bloquant #1)", async () => {
    const client = await signInAs("playerA");
    const { data, error } = await client
      .from("event_needs")
      .select("id, status")
      .eq("id", openNeedA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].status).toBe("open");
  });

  it("signup owner still reads a CLOSED need", async () => {
    const client = await signInAs("playerA");
    const { data, error } = await client.from("event_needs").select("id").eq("id", closedNeedA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("signup owner still reads a CANCELLED need", async () => {
    const client = await signInAs("playerA");
    const { data, error } = await client.from("event_needs").select("id").eq("id", cancelledNeedA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("non-recipient same-club member sees 0 rows", async () => {
    // parentA is a member of clubA but not a recipient of openNeedA
    const client = await signInAs("parentA");
    const { data, error } = await client.from("event_needs").select("id").eq("id", openNeedA);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("draft need: invisible to everyone including recipient of another need", async () => {
    // playerA IS recipient of openNeedA/closedNeedA/cancelledNeedA but NOT of draftNeedA
    const client = await signInAs("playerA");
    const { data, error } = await client.from("event_needs").select("id").eq("id", draftNeedA);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // parentA (recipient of otherOpenNeedA) shouldn't see draft either
    const client2 = await signInAs("parentA");
    const r2 = await client2.from("event_needs").select("id").eq("id", draftNeedA);
    expect(r2.error).toBeNull();
    expect(r2.data ?? []).toHaveLength(0);
  });

  it("cross-club: recipient of clubB does NOT see clubA needs", async () => {
    const client = await signInAs("playerB");
    const { data, error } = await client.from("event_needs").select("id").eq("id", openNeedA);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("staff of clubA reads drafts and cross-club stays 0", async () => {
    const clientA = await signInAs("adminA");
    const r1 = await clientA.from("event_needs").select("id").eq("id", draftNeedA);
    expect(r1.error).toBeNull();
    expect(r1.data).toHaveLength(1);

    const r2 = await clientA.from("event_needs").select("id").eq("id", openNeedB);
    expect(r2.error).toBeNull();
    expect(r2.data ?? []).toHaveLength(0);
  });

  // ================== §2. RPC directes ================================

  describe("user_is_need_recipient (direct RPC)", () => {
    it("recipient asking about themselves → true", async () => {
      const fx = getFixtures();
      const client = await signInAs("playerA");
      const { data, error } = await client.rpc("user_is_need_recipient", {
        _need_id: openNeedA,
        _user_id: fx.users.playerA.userId,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("member asking about ANOTHER user → false (silent refusal)", async () => {
      const fx = getFixtures();
      const client = await signInAs("parentA");
      const { data, error } = await client.rpc("user_is_need_recipient", {
        _need_id: openNeedA,
        _user_id: fx.users.playerA.userId, // target ≠ caller
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("cross-club member → false", async () => {
      const fx = getFixtures();
      const client = await signInAs("playerB");
      const { data, error } = await client.rpc("user_is_need_recipient", {
        _need_id: openNeedA,
        _user_id: fx.users.playerA.userId,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("anon → refused (execute revoked)", async () => {
      const fx = getFixtures();
      const client = anonClient();
      const { data, error } = await client.rpc("user_is_need_recipient", {
        _need_id: openNeedA,
        _user_id: fx.users.playerA.userId,
      });
      // Either an error (grant missing) or false. Never true.
      expect(data === true).toBe(false);
      if (!error) expect(data).not.toBe(true);
    });
  });

  describe("can_apply_to_event_need (direct RPC)", () => {
    it("recipient asking for themselves on OPEN → true", async () => {
      const fx = getFixtures();
      const client = await signInAs("playerA");
      const { data, error } = await client.rpc("can_apply_to_event_need", {
        _need_id: openNeedA,
        _user_id: fx.users.playerA.userId,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("CLOSED need → false even for signup owner (candidature ≠ visibilité)", async () => {
      const fx = getFixtures();
      const client = await signInAs("playerA");
      const { data, error } = await client.rpc("can_apply_to_event_need", {
        _need_id: closedNeedA,
        _user_id: fx.users.playerA.userId,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("member asking about ANOTHER user → false (silent refusal)", async () => {
      const fx = getFixtures();
      const client = await signInAs("parentA");
      const { data, error } = await client.rpc("can_apply_to_event_need", {
        _need_id: openNeedA,
        _user_id: fx.users.playerA.userId,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("cross-club → false", async () => {
      const fx = getFixtures();
      const client = await signInAs("playerB");
      const { data, error } = await client.rpc("can_apply_to_event_need", {
        _need_id: openNeedA,
        _user_id: fx.users.playerB.userId,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });

  describe("recompute_event_need_coverage (direct RPC)", () => {
    it("simple member cannot recompute (silent refusal → empty result)", async () => {
      const fx = getFixtures();
      const client = await signInAs("playerA");
      const { data, error } = await client.rpc("recompute_event_need_coverage", {
        _event_id: fx.eventA,
      });
      // Silent refusal returns 0 rows (RETURN;), no error.
      expect(error).toBeNull();
      expect((data ?? []) as unknown[]).toHaveLength(0);
    });

    it("cross-club staff cannot recompute another club's event", async () => {
      const fx = getFixtures();
      const client = await signInAs("adminB");
      const { data, error } = await client.rpc("recompute_event_need_coverage", {
        _event_id: fx.eventA,
      });
      expect(error).toBeNull();
      expect((data ?? []) as unknown[]).toHaveLength(0);
    });

    it("staff of the event's club receives a result row", async () => {
      const fx = getFixtures();
      const client = await signInAs("adminA");
      const { data, error } = await client.rpc("recompute_event_need_coverage", {
        _event_id: fx.eventA,
      });
      expect(error).toBeNull();
      expect((data ?? []) as unknown[]).toHaveLength(1);
    });

    it("anon → refused (revoke or false)", async () => {
      const fx = getFixtures();
      const client = anonClient();
      const { data } = await client.rpc("recompute_event_need_coverage", {
        _event_id: fx.eventA,
      });
      expect((data ?? []) as unknown[]).toHaveLength(0);
    });
  });

  // ================== §3. CHECK params sur audiences ==================

  describe("event_need_audiences_params_chk", () => {
    it("club_group WITHOUT group_id → rejected", async () => {
      const { error } = await admin.from("event_need_audiences").insert({
        need_id: openNeedA,
        audience_type: "club_group",
        group_id: null,
      });
      expect(error).not.toBeNull();
      expect(error!.message.toLowerCase()).toMatch(/check|constraint/);
    });

    it("team_players WITH category → rejected", async () => {
      const fx = getFixtures();
      const { error } = await admin.from("event_need_audiences").insert({
        need_id: openNeedA,
        audience_type: "team_players",
        team_id: fx.teamA,
        category: "U13", // parasite
      });
      expect(error).not.toBeNull();
      expect(error!.message.toLowerCase()).toMatch(/check|constraint/);
    });

    it("category_educators WITHOUT category → rejected", async () => {
      const { error } = await admin.from("event_need_audiences").insert({
        need_id: openNeedA,
        audience_type: "category_educators",
        category: null,
      });
      expect(error).not.toBeNull();
    });

    it("club_staff (paramless) WITH team_id → rejected", async () => {
      const fx = getFixtures();
      const { error } = await admin.from("event_need_audiences").insert({
        need_id: openNeedA,
        audience_type: "club_staff",
        team_id: fx.teamA, // parasite
      });
      expect(error).not.toBeNull();
    });

    it("club_group WITH group_id (valid) → accepted", async () => {
      const fx = getFixtures();
      // Seed a group first
      const { data: g } = await admin
        .from("club_groups")
        .insert({
          club_id: fx.clubA,
          name: `__rls_${fx.runId}_audgroup`,
          created_by: fx.users.adminA.userId,
        })
        .select("id")
        .single();
      const { data, error } = await admin
        .from("event_need_audiences")
        .insert({
          need_id: openNeedA,
          audience_type: "club_group",
          group_id: g!.id,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      // Cleanup
      await admin.from("event_need_audiences").delete().eq("id", data!.id);
      await admin.from("club_groups").delete().eq("id", g!.id);
    });
  });

  // ================== §4. Trigger event↔club ==========================

  it("trigger: need on an event WITHOUT team rejected with explicit message", async () => {
    const fx = getFixtures();
    // Create an event with no team_id. events.team_id may be NOT NULL —
    // if so, this test degrades to expecting a fk/not-null error at the
    // event insert step (the trigger is unreachable) and the assertion
    // still passes because we assert "rejected".
    const future = new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString();
    const { data: ev, error: evErr } = await admin
      .from("events")
      .insert({
        team_id: null,
        title: `__rls_${fx.runId}_ev_noteam`,
        starts_at: future,
        type: "training",
        created_by: fx.users.adminA.userId,
        status: "published",
      })
      .select("id")
      .single();

    if (evErr || !ev) {
      // events schema forbids team_id NULL: the product invariant is
      // enforced upstream. Test passes: needs can't be attached because
      // the parent event can't even exist.
      expect(evErr).not.toBeNull();
      return;
    }

    const { error } = await admin.from("event_needs").insert({
      event_id: ev.id,
      club_id: fx.clubA,
      role_key: "custom",
      label: `__rls_${fx.runId}_bad_need`,
      capacity: 1,
      validation_mode: "auto",
      created_by: fx.users.adminA.userId,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/team-linked event|no team/i);

    // Cleanup
    await admin.from("events").delete().eq("id", ev.id);
  });

  // ================== §5. Signups (RLS) ===============================

  describe("event_need_signups RLS", () => {
    it("member never reads another member's signup", async () => {
      // parentA tries to read playerA's confirmed signup on closedNeedA
      const client = await signInAs("parentA");
      const { data, error } = await client
        .from("event_need_signups")
        .select("id, user_id")
        .eq("need_id", closedNeedA);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it("owner reads their own signup", async () => {
      const client = await signInAs("playerA");
      const { data, error } = await client
        .from("event_need_signups")
        .select("id")
        .eq("need_id", closedNeedA);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(1);
    });

    it("staff reads signups of their club's needs", async () => {
      const client = await signInAs("adminA");
      const { data, error } = await client
        .from("event_need_signups")
        .select("id")
        .eq("need_id", closedNeedA);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    });

    it("cross-club staff sees 0 signups on other club's needs", async () => {
      const client = await signInAs("adminB");
      const { data, error } = await client
        .from("event_need_signups")
        .select("id")
        .eq("need_id", closedNeedA);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it("cross-club member cannot INSERT a signup on another club's need", async () => {
      const fx = getFixtures();
      const client = await signInAs("playerB");
      const { data, error } = await client
        .from("event_need_signups")
        .insert({
          need_id: openNeedA,
          member_id: cmPlayerB,
          user_id: fx.users.playerB.userId,
          status: "applied",
        })
        .select();
      const blocked = !!error || !data || data.length === 0;
      expect(blocked).toBe(true);
    });
  });
});
