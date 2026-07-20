/**
 * Publications Phase B — get_eligible_vote_subjects.
 *
 * Ensures the RPC returns exactly the subjects the caller can vote on:
 *  - player self (viewer IS the player)
 *  - user self (viewer is a user recipient, e.g. coach)
 *  - player guardian (parent with can_respond=true)
 *  - NO subject when parent has can_respond=false (visibility ≠ voting right)
 *  - current_option_id follows the caller's vote per subject.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

const created: string[] = [];

async function createPollPub(clubId: string, authorId: string, title: string) {
  const { data, error } = await admin
    .from("club_publications")
    .insert({
      club_id: clubId,
      author_id: authorId,
      publication_type: "poll",
      title,
      content: "",
      poll_visibility: "staff_visible",
      publish_to_wall: true,
      send_email: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  created.push(data!.id);
  return data!.id as string;
}

async function publish(pubId: string, adminClient: any) {
  const { error } = await adminClient.rpc("publish_publication_atomic" as any, {
    _publication_id: pubId,
    _kind: "publish",
    _dispatch_id: null,
  });
  expect(error).toBeNull();
}

describe("publications — get_eligible_vote_subjects", () => {
  afterAll(async () => {
    if (created.length) {
      await admin.from("club_poll_votes").delete().in("publication_id", created);
      await admin.from("club_publication_recipients").delete().in("publication_id", created);
      await admin.from("club_publication_dispatches").delete().in("publication_id", created);
      await admin.from("club_poll_options").delete().in("publication_id", created);
      await admin.from("club_publication_audiences").delete().in("publication_id", created);
      await admin.from("club_publications").delete().in("id", created);
    }
  });

  it("player recipient (self) — 1 subject 'player' relation 'self'", async () => {
    const fx = getFixtures();
    const pubId = await createPollPub(fx.clubA, fx.users.adminA.userId, "eligible-self-player");
    await admin.from("club_publication_audiences").insert({
      publication_id: pubId,
      audience_type: "joueurs_equipe",
      team_id: fx.teamA,
    });
    await admin.from("club_poll_options").insert([
      { publication_id: pubId, label: "A", sort_order: 0 },
      { publication_id: pubId, label: "B", sort_order: 1 },
    ]);
    const cAdmin = await signInAs("adminA");
    await publish(pubId, cAdmin);

    // playerA is linked to users.playerA
    const cPlayer = await signInAs("playerA");
    const { data, error } = await cPlayer.rpc("get_eligible_vote_subjects" as any, {
      _publication_id: pubId,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].subject_kind).toBe("player");
    expect(rows[0].relation).toBe("self");
    expect(rows[0].subject_id).toBe(fx.playerA);
    expect(rows[0].current_option_id).toBeNull();
  });

  it("coach recipient — 1 subject 'user' relation 'self'", async () => {
    const fx = getFixtures();
    const pubId = await createPollPub(fx.clubA, fx.users.adminA.userId, "eligible-coach");
    await admin
      .from("club_publication_audiences")
      .insert({ publication_id: pubId, audience_type: "educateurs" });
    await admin.from("club_poll_options").insert([
      { publication_id: pubId, label: "Y", sort_order: 0 },
      { publication_id: pubId, label: "N", sort_order: 1 },
    ]);
    const cAdmin = await signInAs("adminA");
    await publish(pubId, cAdmin);

    const cCoach = await signInAs("coachA");
    const { data } = await cCoach.rpc("get_eligible_vote_subjects" as any, {
      _publication_id: pubId,
    });
    const rows = (data ?? []) as any[];
    expect(rows.length).toBe(1);
    expect(rows[0].subject_kind).toBe("user");
    expect(rows[0].relation).toBe("self");
    expect(rows[0].subject_id).toBe(fx.users.coachA.userId);
  });

  it("parent with can_respond=true → 1 'player' subject relation 'guardian' + current vote reflected", async () => {
    const fx = getFixtures();
    const pubId = await createPollPub(fx.clubA, fx.users.adminA.userId, "eligible-parent-can");
    await admin.from("club_publication_audiences").insert({
      publication_id: pubId,
      audience_type: "joueurs_equipe",
      team_id: fx.teamA,
    });
    const { data: opts } = await admin
      .from("club_poll_options")
      .insert([
        { publication_id: pubId, label: "Oui", sort_order: 0 },
        { publication_id: pubId, label: "Non", sort_order: 1 },
      ])
      .select("id, sort_order");
    const cAdmin = await signInAs("adminA");
    await publish(pubId, cAdmin);

    const cParent = await signInAs("parentA");
    let { data } = await cParent.rpc("get_eligible_vote_subjects" as any, {
      _publication_id: pubId,
    });
    let rows = (data ?? []) as any[];
    // parentA is linked to playerA (can_respond=true); playerA is also the user
    // himself, so from parentA's viewpoint it's guardian (playerA.user_id != parentA.user_id).
    const guardian = rows.find((r: any) => r.relation === "guardian");
    expect(guardian).toBeTruthy();
    expect(guardian.subject_kind).toBe("player");
    expect(guardian.subject_id).toBe(fx.playerA);
    expect(guardian.current_option_id).toBeNull();

    // Cast vote as parent for player subject
    const optOui = opts!.find((o: any) => o.sort_order === 0)!.id;
    const { error: vErr } = await cParent.rpc("cast_poll_vote" as any, {
      _publication_id: pubId,
      _option_id: optOui,
      _subject_kind: "player",
      _subject_id: fx.playerA,
    });
    expect(vErr).toBeNull();

    ({ data } = await cParent.rpc("get_eligible_vote_subjects" as any, {
      _publication_id: pubId,
    }));
    rows = (data ?? []) as any[];
    const g2 = rows.find((r: any) => r.subject_id === fx.playerA);
    expect(g2.current_option_id).toBe(optOui);
  });

  it("parent with can_respond=false → 0 votable subject (but visibility preserved)", async () => {
    const fx = getFixtures();
    // Use parentUnlinkedA and link them to playerA2 with can_respond=false
    await admin.from("player_parents").insert({
      player_id: fx.playerA2,
      parent_user_id: fx.users.parentUnlinkedA.userId,
      can_respond: false,
    });

    const pubId = await createPollPub(fx.clubA, fx.users.adminA.userId, "eligible-parent-nocan");
    await admin.from("club_publication_audiences").insert({
      publication_id: pubId,
      audience_type: "joueurs_equipe",
      team_id: fx.teamA,
    });
    await admin.from("club_poll_options").insert([
      { publication_id: pubId, label: "A", sort_order: 0 },
      { publication_id: pubId, label: "B", sort_order: 1 },
    ]);
    const cAdmin = await signInAs("adminA");
    await publish(pubId, cAdmin);

    const cParent = await signInAs("parentUnlinkedA");
    const { data, error } = await cParent.rpc("get_eligible_vote_subjects" as any, {
      _publication_id: pubId,
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(0);

    // But cast_poll_vote must reject
    const { data: opts } = await admin
      .from("club_poll_options")
      .select("id")
      .eq("publication_id", pubId)
      .limit(1);
    const { error: vErr } = await cParent.rpc("cast_poll_vote" as any, {
      _publication_id: pubId,
      _option_id: opts![0].id,
      _subject_kind: "player",
      _subject_id: fx.playerA2,
    });
    expect(vErr).toBeTruthy();

    // Cleanup fixture link
    await admin
      .from("player_parents")
      .delete()
      .eq("player_id", fx.playerA2)
      .eq("parent_user_id", fx.users.parentUnlinkedA.userId);
  });
});
