/**
 * Publications Phase B — preview parity + authorization.
 *
 * Anti-drift guard: preview_publication_audience(...).count MUST equal the
 * number of recipients created by publish_publication_atomic on the SAME
 * audiences. Both share the internal _resolve_audience_subjects core.
 *
 * Also verifies staff-only access.
 */
import { describe, it, expect, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";

const created: string[] = [];

afterAll(async () => {
  if (created.length) {
    await admin.from("club_publication_recipients").delete().in("publication_id", created);
    await admin.from("club_publication_dispatches").delete().in("publication_id", created);
    await admin.from("club_publication_audiences").delete().in("publication_id", created);
    await admin.from("club_publications").delete().in("id", created);
  }
});

describe("publications — preview_publication_audience", () => {
  it("count matches actual recipients created by publish (anti-drift)", async () => {
    const fx = getFixtures();

    // Ad-hoc audiences: team A players + educateurs (coach)
    const audiences = [
      { audience_type: "joueurs_equipe", team_id: fx.teamA },
      { audience_type: "educateurs" },
    ];

    const cAdmin = await signInAs("adminA");
    const { data: prev, error: prevErr } = await cAdmin.rpc(
      "preview_publication_audience" as any,
      {
        _club_id: fx.clubA,
        _event_id: null,
        _audiences: audiences,
        _manual_member_ids: [],
      },
    );
    expect(prevErr, prevErr?.message).toBeNull();
    const previewRow = Array.isArray(prev) ? prev[0] : prev;
    const previewCount = previewRow.count as number;

    // Persist the same audience via a real publication + publish
    const { data: pub } = await admin
      .from("club_publications")
      .insert({
        club_id: fx.clubA,
        author_id: fx.users.adminA.userId,
        publication_type: "message",
        title: "preview-parity",
        content: "",
        publish_to_wall: true,
        send_email: false,
      })
      .select("id")
      .single();
    const pubId = pub!.id as string;
    created.push(pubId);
    await admin.from("club_publication_audiences").insert(
      audiences.map((a) => ({ publication_id: pubId, ...a })),
    );

    const { data: pubRes, error: pubErr } = await cAdmin.rpc(
      "publish_publication_atomic" as any,
      { _publication_id: pubId, _kind: "publish", _dispatch_id: null },
    );
    expect(pubErr, pubErr?.message).toBeNull();
    const row = Array.isArray(pubRes) ? pubRes[0] : pubRes;

    expect(previewCount).toBe(row.recipients_count);

    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("id")
      .eq("publication_id", pubId);
    expect(recs!.length).toBe(previewCount);
  });

  it("manual-only selection: create-path mirrors preview count (regression)", async () => {
    const fx = getFixtures();
    const manual = [fx.playerA, fx.playerA2];

    const cAdmin = await signInAs("adminA");
    // 1) Preview with selection_manuelle marker + manual list.
    const { data: prev, error: prevErr } = await cAdmin.rpc(
      "preview_publication_audience" as any,
      {
        _club_id: fx.clubA,
        _event_id: null,
        _audiences: [{ audience_type: "selection_manuelle" }],
        _manual_member_ids: manual,
      },
    );
    expect(prevErr, prevErr?.message).toBeNull();
    const previewCount = (Array.isArray(prev) ? prev[0] : prev).count as number;
    expect(previewCount).toBeGreaterThan(0);

    // 2) Create-path: insert publication + manual_members WITHOUT any audience row,
    //    then rely on createPublication's marker insertion. We mirror that here:
    //    insert the selection_manuelle marker (as createPublication does) and
    //    the manual_members rows, then publish.
    const { data: pub } = await admin
      .from("club_publications")
      .insert({
        club_id: fx.clubA,
        author_id: fx.users.adminA.userId,
        publication_type: "message",
        title: "manual-only-parity",
        content: "",
        publish_to_wall: true,
        send_email: false,
      })
      .select("id")
      .single();
    const pubId = pub!.id as string;
    created.push(pubId);

    // Emulate createPublication: it now persists the selection_manuelle marker
    // when manualMemberIds is non-empty (even if audiences=[] client-side).
    await admin
      .from("club_publication_audiences")
      .insert([{ publication_id: pubId, audience_type: "selection_manuelle" }]);
    await admin
      .from("club_publication_manual_members")
      .insert(manual.map((m) => ({ publication_id: pubId, member_id: m })));

    const { data: pubRes, error: pubErr } = await cAdmin.rpc(
      "publish_publication_atomic" as any,
      { _publication_id: pubId, _kind: "publish", _dispatch_id: null },
    );
    expect(pubErr, pubErr?.message).toBeNull();
    const row = Array.isArray(pubRes) ? pubRes[0] : pubRes;
    expect(row.recipients_count).toBe(previewCount);

    // Both manual players must be among the recipients.
    const { data: recs } = await admin
      .from("club_publication_recipients")
      .select("subject_kind, member_id")
      .eq("publication_id", pubId);
    const playerMemberIds = (recs ?? [])
      .filter((r: any) => r.subject_kind === "player")
      .map((r: any) => r.member_id);
    expect(playerMemberIds).toEqual(expect.arrayContaining(manual));
  });

  it("forbidden for non-staff of the target club", async () => {
    const fx = getFixtures();
    const cCoachB = await signInAs("coachB"); // not staff of clubA
    const { error } = await cCoachB.rpc("preview_publication_audience" as any, {
      _club_id: fx.clubA,
      _event_id: null,
      _audiences: [{ audience_type: "educateurs" }],
      _manual_member_ids: [],
    });
    expect(error).toBeTruthy();
    expect(error!.message.toLowerCase()).toContain("forbidden");
  });
});

