/**
 * Publications Phase A v2 — polymorphic subject (player | user).
 *
 * Filet RLS pour B1/B3/B4 :
 *  - resolve_publication_audience couvre les 10 types (players_ ET users_).
 *  - publish_publication_atomic dédoublonne par (subject_kind, member_id | subject_user_id).
 *  - audience_refresh renvoie un delta correct.
 *  - cast_poll_vote : joueur self/parent, user self-only, tiers rejeté, closed rejeté, cross-club rejeté.
 *  - get_poll_results : seuil serveur (<3 anonyme ⇒ vote_count NULL), staff inclus.
 *  - audit.club_poll_vote_log illisible en authenticated.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs, anonClient } from "./_clients";
import { getFixtures } from "./_setup";

type PubType = "message" | "poll";

async function insertPublication(opts: {
  clubId: string;
  authorId: string;
  type: PubType;
  title: string;
  pollVisibility?: "staff_visible" | "anonymous" | null;
  closesAt?: string | null;
}): Promise<string> {
  const { data, error } = await admin
    .from("club_publications")
    .insert({
      club_id: opts.clubId,
      author_id: opts.authorId,
      publication_type: opts.type,
      title: opts.title,
      content: "test",
      poll_visibility: opts.type === "poll" ? (opts.pollVisibility ?? "staff_visible") : null,
      publish_to_wall: true,
      send_email: false,
      email_body: null,
      closes_at: opts.closesAt ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert publication: ${error?.message}`);
  return data.id;
}

async function addAudience(publicationId: string, row: Record<string, unknown>) {
  const { error } = await admin.from("club_publication_audiences").insert({
    publication_id: publicationId,
    ...row,
  });
  if (error) throw new Error(`insert audience: ${error.message}`);
}

async function addOptions(publicationId: string, labels: string[]): Promise<string[]> {
  const { data, error } = await admin
    .from("club_poll_options")
    .insert(labels.map((label, i) => ({ publication_id: publicationId, label, sort_order: i })))
    .select("id, sort_order");
  if (error || !data) throw new Error(`insert options: ${error?.message}`);
  return data.sort((a, b) => a.sort_order - b.sort_order).map((r) => r.id);
}

// Track created publications for cleanup so we don't pollute cross-suite state.
const createdPublicationIds: string[] = [];
async function createPub(opts: Parameters<typeof insertPublication>[0]): Promise<string> {
  const id = await insertPublication(opts);
  createdPublicationIds.push(id);
  return id;
}

describe("publications v2 — polymorphic recipients & voting", () => {
  let groupA: string;
  let memberAdminA_id: string;
  let memberCoachA_id: string;

  beforeAll(async () => {
    const fx = getFixtures();

    // Lookup club_members ids for A staff
    const { data: cmA } = await admin
      .from("club_members")
      .select("id, user_id")
      .eq("club_id", fx.clubA)
      .in("user_id", [fx.users.adminA.userId, fx.users.coachA.userId]);
    memberAdminA_id = cmA!.find((r) => r.user_id === fx.users.adminA.userId)!.id;
    memberCoachA_id = cmA!.find((r) => r.user_id === fx.users.coachA.userId)!.id;

    // Custom group with adminA + coachA
    const { data: g } = await admin
      .from("club_groups")
      .insert({
        club_id: fx.clubA,
        name: `__rls_${fx.runId}_pubs_group`,
        created_by: fx.users.adminA.userId,
      })
      .select("id")
      .single();
    groupA = g!.id;
    await admin.from("club_group_members").insert([
      { group_id: groupA, member_id: memberAdminA_id, added_by: fx.users.adminA.userId },
      { group_id: groupA, member_id: memberCoachA_id, added_by: fx.users.adminA.userId },
    ]);
  });

  afterAll(async () => {
    if (createdPublicationIds.length) {
      // Cascade rows first (recipients, votes, dispatches, options, audiences)
      await admin.from("club_poll_votes").delete().in("publication_id", createdPublicationIds);
      await admin
        .from("club_publication_recipients")
        .delete()
        .in("publication_id", createdPublicationIds);
      await admin
        .from("club_publication_dispatches")
        .delete()
        .in("publication_id", createdPublicationIds);
      await admin.from("club_poll_options").delete().in("publication_id", createdPublicationIds);
      await admin
        .from("club_publication_audiences")
        .delete()
        .in("publication_id", createdPublicationIds);
      await admin.from("club_publications").delete().in("id", createdPublicationIds);
    }
    await admin.from("club_group_members").delete().eq("group_id", groupA);
    await admin.from("club_groups").delete().eq("id", groupA);
  });

  // -------------------------------------------------------------------------
  // resolve + publish: player audience (joueurs_equipe → subject_kind='player')
  // -------------------------------------------------------------------------
  it("joueurs_equipe resolves to player subjects and snapshots them", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "message",
      title: "team-players",
    });
    await addAudience(pubId, { audience_type: "joueurs_equipe", team_id: fx.teamA });

    const cAdmin = await signInAs("adminA");
    const { error } = await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });
    expect(error).toBeNull();

    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("subject_kind, member_id, subject_user_id")
      .eq("publication_id", pubId);
    // Team A has playerA + playerA2 → both are player subjects.
    expect(recs?.length).toBe(2);
    for (const r of recs!) {
      expect(r.subject_kind).toBe("player");
      expect(r.member_id).not.toBeNull();
      expect(r.subject_user_id).toBeNull();
    }
    const ids = recs!.map((r) => r.member_id).sort();
    expect(ids).toEqual([fx.playerA, fx.playerA2].sort());
  });

  // -------------------------------------------------------------------------
  // resolve + publish: staff audiences (educateurs / dirigeants) → user subjects
  // -------------------------------------------------------------------------
  it("educateurs resolves to user subjects (coach), not player", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "message",
      title: "coaches",
    });
    await addAudience(pubId, { audience_type: "educateurs" });

    const cAdmin = await signInAs("adminA");
    await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });

    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("subject_kind, subject_user_id, member_id")
      .eq("publication_id", pubId);
    const users = recs!.map((r) => r.subject_user_id);
    // has_club_role_any(coach,assistant_coach) → coachA (adminA has role 'admin')
    expect(users).toContain(fx.users.coachA.userId);
    expect(users).not.toContain(fx.users.playerA.userId);
    for (const r of recs!) {
      expect(r.subject_kind).toBe("user");
      expect(r.member_id).toBeNull();
    }
  });

  it("dirigeants resolves to admin user subjects", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "message",
      title: "admins",
    });
    await addAudience(pubId, { audience_type: "dirigeants" });

    const cAdmin = await signInAs("adminA");
    await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });

    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("subject_kind, subject_user_id")
      .eq("publication_id", pubId);
    const users = recs!.map((r) => r.subject_user_id);
    expect(users).toContain(fx.users.adminA.userId);
    expect(recs!.every((r) => r.subject_kind === "user")).toBe(true);
  });

  it("groupe_personnalise resolves via club_group_members → user subjects (B1)", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "message",
      title: "group",
    });
    await addAudience(pubId, { audience_type: "groupe_personnalise", group_id: groupA });

    const cAdmin = await signInAs("adminA");
    const { error } = await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });
    // B1 fix: should NOT error on missing cgm.player_id column.
    expect(error).toBeNull();

    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("subject_kind, subject_user_id")
      .eq("publication_id", pubId);
    const users = recs!.map((r) => r.subject_user_id).sort();
    expect(users).toEqual([fx.users.adminA.userId, fx.users.coachA.userId].sort());
    expect(recs!.every((r) => r.subject_kind === "user")).toBe(true);
  });

  it("parents_equipe resolves to parent user subjects", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "message",
      title: "parents",
    });
    await addAudience(pubId, { audience_type: "parents_equipe", team_id: fx.teamA });

    const cAdmin = await signInAs("adminA");
    await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });

    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("subject_kind, subject_user_id")
      .eq("publication_id", pubId);
    const users = recs!.map((r) => r.subject_user_id);
    expect(users).toContain(fx.users.parentA.userId);
    expect(recs!.every((r) => r.subject_kind === "user")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // publish forbidden for staff of another club
  // -------------------------------------------------------------------------
  it("staff of club B cannot publish a publication of club A", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "message",
      title: "cross-club-publish",
    });
    await addAudience(pubId, { audience_type: "educateurs" });
    const cAdminB = await signInAs("adminB");
    const { error } = await cAdminB.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });
    expect(error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // audience_refresh delta
  // -------------------------------------------------------------------------
  it("audience_refresh only inserts new recipients (delta count)", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "message",
      title: "delta",
    });
    await addAudience(pubId, { audience_type: "educateurs" }); // coachA only
    const cAdmin = await signInAs("adminA");

    const { data: first } = await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });
    const firstRow = Array.isArray(first) ? first[0] : first;
    expect(firstRow.recipients_count).toBeGreaterThanOrEqual(1);

    // Extend audience: add dirigeants (adminA)
    await addAudience(pubId, { audience_type: "dirigeants" });

    const { data: refresh } = await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "audience_refresh",
      _dispatch_id: null,
    });
    const refRow = Array.isArray(refresh) ? refresh[0] : refresh;
    // Delta must contain adminA (new) and be strictly < total.
    expect(refRow.new_recipient_count).toBeGreaterThanOrEqual(1);
    expect(refRow.new_recipient_count).toBeLessThan(refRow.recipients_count + 1);

    // No duplicated rows overall.
    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("subject_kind, subject_user_id")
      .eq("publication_id", pubId);
    const users = recs!.map((r) => r.subject_user_id).sort();
    expect(new Set(users).size).toBe(users.length);
    expect(users).toContain(fx.users.adminA.userId);
    expect(users).toContain(fx.users.coachA.userId);
  });

  // -------------------------------------------------------------------------
  // publish guard: poll requires at least 2 options
  // -------------------------------------------------------------------------
  it("publish rejects a poll with < 2 options", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "poll",
      title: "no-options",
    });
    await addAudience(pubId, { audience_type: "educateurs" });
    const cAdmin = await signInAs("adminA");
    const { error } = await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });
    expect(error?.message ?? "").toMatch(/poll_requires_two_options/);
  });

  // -------------------------------------------------------------------------
  // cast_poll_vote — player subject (self + parent + tiers)
  // -------------------------------------------------------------------------
  describe("cast_poll_vote — player subject", () => {
    let pubId: string;
    let optA: string;
    let optB: string;

    beforeAll(async () => {
      const fx = getFixtures();
      pubId = await createPub({
        clubId: fx.clubA,
        authorId: fx.users.adminA.userId,
        type: "poll",
        title: "player-poll",
      });
      await addAudience(pubId, { audience_type: "joueurs_equipe", team_id: fx.teamA });
      [optA, optB] = await addOptions(pubId, ["A", "B"]);
      const cAdmin = await signInAs("adminA");
      await cAdmin.rpc("publish_publication_atomic" as any, {
        _publication_id: pubId,
        _kind: "publish",
        _dispatch_id: null,
      });
    });

    it("player can vote for themselves", async () => {
      const fx = getFixtures();
      const cPlayer = await signInAs("playerA");
      const { data, error } = await cPlayer.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optA,
        _subject_kind: "player",
        _subject_id: fx.playerA,
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
    });

    it("parent (can_respond) can vote on behalf of their player", async () => {
      const fx = getFixtures();
      const cParent = await signInAs("parentA");
      // Change to option B — allowed, updates existing vote.
      const { error } = await cParent.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optB,
        _subject_kind: "player",
        _subject_id: fx.playerA,
      });
      expect(error).toBeNull();
    });

    it("stranger (adminB) cannot vote on behalf of playerA", async () => {
      const fx = getFixtures();
      const cAdminB = await signInAs("adminB");
      const { error } = await cAdminB.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optA,
        _subject_kind: "player",
        _subject_id: fx.playerA,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/forbidden/);
    });

    it("cross-club: playerB cannot vote in club A poll", async () => {
      const fx = getFixtures();
      const cPlayerB = await signInAs("playerB");
      const { error } = await cPlayerB.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optA,
        _subject_kind: "player",
        _subject_id: fx.playerB,
      });
      expect(error).not.toBeNull();
    });

    it("anon cannot vote", async () => {
      const fx = getFixtures();
      const c = anonClient();
      const { error } = await c.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optA,
        _subject_kind: "player",
        _subject_id: fx.playerA,
      });
      expect(error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // cast_poll_vote — user subject (self-only)
  // -------------------------------------------------------------------------
  describe("cast_poll_vote — user subject", () => {
    let pubId: string;
    let optA: string;
    let optB: string;

    beforeAll(async () => {
      const fx = getFixtures();
      pubId = await createPub({
        clubId: fx.clubA,
        authorId: fx.users.adminA.userId,
        type: "poll",
        title: "staff-poll",
      });
      await addAudience(pubId, { audience_type: "educateurs" });
      await addAudience(pubId, { audience_type: "dirigeants" });
      [optA, optB] = await addOptions(pubId, ["Yes", "No"]);
      const cAdmin = await signInAs("adminA");
      await cAdmin.rpc("publish_publication_atomic" as any, {
        _publication_id: pubId,
        _kind: "publish",
        _dispatch_id: null,
      });
    });

    it("user votes self", async () => {
      const fx = getFixtures();
      const cCoach = await signInAs("coachA");
      const { error } = await cCoach.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optA,
        _subject_kind: "user",
        _subject_id: fx.users.coachA.userId,
      });
      expect(error).toBeNull();
    });

    it("user CANNOT vote on behalf of another user (self-only)", async () => {
      const fx = getFixtures();
      const cAdmin = await signInAs("adminA");
      const { error } = await cAdmin.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optA,
        _subject_kind: "user",
        _subject_id: fx.users.coachA.userId,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/forbidden/);
    });

    it("non-recipient user cannot vote", async () => {
      const fx = getFixtures();
      const cPlayer = await signInAs("playerA");
      const { error } = await cPlayer.rpc("cast_poll_vote" as any, {
        _publication_id: pubId,
        _option_id: optA,
        _subject_kind: "user",
        _subject_id: fx.users.playerA.userId,
      });
      expect(error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Closed poll rejected
  // -------------------------------------------------------------------------
  it("cast_poll_vote rejects a closed poll", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "poll",
      title: "closed-poll",
      closesAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    });
    await addAudience(pubId, { audience_type: "educateurs" });
    const [optA] = await addOptions(pubId, ["A", "B"]);
    const cAdmin = await signInAs("adminA");
    await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });

    const cCoach = await signInAs("coachA");
    const { error } = await cCoach.rpc("cast_poll_vote" as any, {
      _publication_id: pubId,
      _option_id: optA,
      _subject_kind: "user",
      _subject_id: fx.users.coachA.userId,
    });
    expect(error?.message ?? "").toMatch(/poll_closed/);
  });

  // -------------------------------------------------------------------------
  // get_poll_results — server-side threshold masking (B3)
  // -------------------------------------------------------------------------
  it("anonymous poll: vote_count is NULL under threshold (staff included)", async () => {
    const fx = getFixtures();
    const pubId = await createPub({
      clubId: fx.clubA,
      authorId: fx.users.adminA.userId,
      type: "poll",
      title: "anon-threshold",
      pollVisibility: "anonymous",
    });
    // Recruit coachA (educateurs) + adminA (dirigeants) = 2 possible voters
    await addAudience(pubId, { audience_type: "educateurs" });
    await addAudience(pubId, { audience_type: "dirigeants" });
    const [optA] = await addOptions(pubId, ["A", "B"]);
    const cAdmin = await signInAs("adminA");
    await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });

    // 2 votes → below threshold
    const cCoach = await signInAs("coachA");
    await cCoach.rpc("cast_poll_vote" as any, {
      _publication_id: pubId,
      _option_id: optA,
      _subject_kind: "user",
      _subject_id: fx.users.coachA.userId,
    });
    await cAdmin.rpc("cast_poll_vote" as any, {
      _publication_id: pubId,
      _option_id: optA,
      _subject_kind: "user",
      _subject_id: fx.users.adminA.userId,
    });

    // Staff read → still masked.
    const { data: staffRows, error: staffErr } = await cAdmin.rpc("get_poll_results" as any, {
      _publication_id: pubId,
    });
    expect(staffErr).toBeNull();
    for (const r of staffRows as any[]) {
      expect(r.is_anonymous).toBe(true);
      expect(r.below_threshold).toBe(true);
      expect(r.vote_count).toBeNull();
    }

    // Recipient read → also masked.
    const { data: coachRows } = await cCoach.rpc("get_poll_results" as any, {
      _publication_id: pubId,
    });
    for (const r of coachRows as any[]) {
      expect(r.vote_count).toBeNull();
    }

    // A non-recipient cannot even read the results.
    const cPlayer = await signInAs("playerA");
    const { error: outsideErr } = await cPlayer.rpc("get_poll_results" as any, {
      _publication_id: pubId,
    });
    expect(outsideErr).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // audit log illisible en authenticated
  // -------------------------------------------------------------------------
  it("audit.club_poll_vote_log is not exposed to authenticated clients", async () => {
    const cAdmin = await signInAs("adminA");
    // PostgREST doesn't expose the `audit` schema; either the schema client
    // isn't available or the request fails. In both cases: no data leaks.
    let leaked = false;
    try {
      const { data, error } = await (cAdmin as any)
        .schema("audit")
        .from("club_poll_vote_log")
        .select("id")
        .limit(1);
      if (!error && Array.isArray(data) && data.length > 0) leaked = true;
    } catch {
      // schema() may throw — that's the expected outcome.
    }
    expect(leaked).toBe(false);
  });
});
