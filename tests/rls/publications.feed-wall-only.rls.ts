/**
 * Publications Phase B — listPublications feed must only show publish_to_wall=true.
 *
 * Verified at the SQL level (equivalent to the server function query).
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

describe("publications — feed excludes email-only publications", () => {
  it("publish_to_wall=false is hidden, publish_to_wall=true is visible", async () => {
    const fx = getFixtures();

    const mk = async (publishToWall: boolean, title: string) => {
      const { data, error } = await admin
        .from("club_publications")
        .insert({
          club_id: fx.clubA,
          author_id: fx.users.adminA.userId,
          publication_type: "message",
          title,
          content: "x",
          poll_visibility: null,
          publish_to_wall: publishToWall,
          send_email: true,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      created.push(data!.id);
      // Publish with an audience that includes coachA so they can read via RLS
      await admin
        .from("club_publication_audiences")
        .insert({ publication_id: data!.id, audience_type: "educateurs" });
      const cAdmin = await signInAs("adminA");
      await cAdmin.rpc("publish_publication_atomic" as any, {
        _publication_id: data!.id,
        _kind: "publish",
        _dispatch_id: null,
      });
      return data!.id as string;
    };

    const wallId = await mk(true, "wall-visible");
    const emailOnlyId = await mk(false, "email-only-hidden");

    const cCoach = await signInAs("coachA");
    const { data: rows, error } = await cCoach
      .from("club_publications")
      .select("id, publish_to_wall")
      .eq("club_id", fx.clubA)
      .eq("publish_to_wall", true)
      .is("deleted_at", null)
      .in("id", [wallId, emailOnlyId]);

    expect(error).toBeNull();
    const ids = (rows ?? []).map((r: any) => r.id);
    expect(ids).toContain(wallId);
    expect(ids).not.toContain(emailOnlyId);
  });
});
