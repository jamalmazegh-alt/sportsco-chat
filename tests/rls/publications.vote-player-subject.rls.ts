/**
 * Publications Phase B — end-to-end vote via subject_kind='player'.
 *
 * The existing suite only covered subject_kind='user' from the UI. This
 * adds a bout-en-bout check: a player casts a poll vote on themselves via
 * subjectKind='player'.
 */
import { describe, it, expect, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

const created: string[] = [];

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

describe("publications — cast_poll_vote via player subject (self)", () => {
  it("player self casts a poll vote via subjectKind='player'", async () => {
    const fx = getFixtures();
    const { data: pub, error: pubErr } = await admin
      .from("club_publications")
      .insert({
        club_id: fx.clubA,
        author_id: fx.users.adminA.userId,
        publication_type: "poll",
        title: "e2e-player-vote",
        content: "",
        poll_visibility: "staff_visible",
        publish_to_wall: true,
        send_email: false,
      })
      .select("id")
      .single();
    expect(pubErr).toBeNull();
    const pubId = pub!.id as string;
    created.push(pubId);

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
    const optYes = opts!.find((o: any) => o.sort_order === 0)!.id as string;

    const cAdmin = await signInAs("adminA");
    await cAdmin.rpc("publish_publication_atomic" as any, {
      _publication_id: pubId,
      _kind: "publish",
      _dispatch_id: null,
    });

    // Player votes ON themselves via player subject
    const cPlayer = await signInAs("playerA");
    const { data: voteId, error } = await cPlayer.rpc("cast_poll_vote" as any, {
      _publication_id: pubId,
      _option_id: optYes,
      _subject_kind: "player",
      _subject_id: fx.playerA,
    });
    expect(error, `cast_poll_vote failed: ${error?.message}`).toBeNull();
    expect(voteId).toBeTruthy();

    // And the vote row is reachable via own-read RLS
    const { data: myVote } = await cPlayer
      .from("club_poll_votes")
      .select("subject_kind, member_id, option_id")
      .eq("publication_id", pubId)
      .maybeSingle();
    expect(myVote?.subject_kind).toBe("player");
    expect(myVote?.member_id).toBe(fx.playerA);
    expect(myVote?.option_id).toBe(optYes);
  });
});
