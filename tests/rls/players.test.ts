import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectUpdateBlocked,
  expectInsertAllowed,
} from "./_helpers";

describe("RLS: players", () => {
  it("adminA reads playerA, not playerB", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "players", fx.playerA);
    await expectNoAccess(c, "players", fx.playerB);
  });

  it("playerA sees themselves (clubmate visibility)", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectCanRead(c, "players", fx.playerA);
  });

  it("adminA can create a player in clubA", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const row = await expectInsertAllowed(c, "players", {
      club_id: fx.clubA,
      first_name: "Tmp",
      last_name: "Player",
    });
    await c.from("players").delete().eq("id", row.id);
  });

  it("playerA cannot create a player in clubA (not admin/coach)", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectInsertBlocked(c, "players", {
      club_id: fx.clubA,
      first_name: "Hack",
      last_name: "Self",
    });
  });

  it("adminB cannot update playerA (cross-club)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectUpdateBlocked(c, "players", fx.playerA, { last_name: "Hacked" });
  });

  it("coachA can update playerA (admin/coach write)", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    const { data, error } = await c
      .from("players")
      .update({ jersey_number: 99 })
      .eq("id", fx.playerA)
      .select();
    // No throw + at least one row returned
    if (error || !data || data.length === 0) {
      throw new Error(`Expected coachA update allowed: ${error?.message}`);
    }
  });

  it("parentA can update playerA media consent only", async () => {
    const fx = getFixtures();
    const c = await signInAs("parentA");
    const { data, error } = await c
      .from("players")
      .update({ media_consent_status: "granted" })
      .eq("id", fx.playerA)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(`Expected parent update allowed: ${error?.message}`);
    }
  });
});
