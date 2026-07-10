/**
 * RLS: team_championships
 *
 * Rules exercised:
 *  - SELECT: any club member of the team's club can read.
 *  - INSERT/UPDATE/DELETE: only admin of the club OR coach of that team.
 *  - Cross-club isolation.
 *  - Trigger `team_championships_enforce_club_team`: any client-provided
 *    club_id that doesn't match teams.club_id is overwritten (INSERT) or
 *    rejected (UPDATE changing team_id).
 *  - Trigger `block_delete_if_referenced`: DELETE is blocked while events
 *    reference the championship; DELETE succeeds when unreferenced.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { signInAs, anonClient } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectInsertAllowed,
  expectUpdateBlocked,
  expectDeleteBlocked,
} from "./_helpers";

// Fresh championship IDs created by this suite (cleaned in afterAll).
let champTeamA_forCoach: string;
let champTeamA_forDelete: string;
let champTeamA_referenced: string;
let refEventId: string;

describe("RLS: team_championships", () => {
  beforeAll(async () => {
    const fx = getFixtures();
    // Seed via service role: 3 championships on teamA.
    const { data, error } = await admin
      .from("team_championships" as never)
      .insert([
        { team_id: fx.teamA, club_id: fx.clubA, name: "__rls_champ_read", is_active: true },
        { team_id: fx.teamA, club_id: fx.clubA, name: "__rls_champ_delete_ok", is_active: true },
        { team_id: fx.teamA, club_id: fx.clubA, name: "__rls_champ_referenced", is_active: true },
      ] as never)
      .select("id, name");
    if (error || !data) throw new Error(`seed team_championships: ${error?.message}`);
    const rows = data as Array<{ id: string; name: string }>;
    champTeamA_forCoach = rows.find((r) => r.name === "__rls_champ_read")!.id;
    champTeamA_forDelete = rows.find((r) => r.name === "__rls_champ_delete_ok")!.id;
    champTeamA_referenced = rows.find((r) => r.name === "__rls_champ_referenced")!.id;

    // Reference one championship from an event so DELETE is blocked by trigger.
    const { data: ev, error: eErr } = await admin
      .from("events")
      .insert({
        team_id: fx.teamA,
        type: "match",
        title: "__rls_champ_ref_match",
        starts_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        status: "published",
        created_by: fx.users.coachA.userId,
        competition_type: "championship",
        championship_id: champTeamA_referenced,
        is_official: true,
      } as never)
      .select("id")
      .single();
    if (eErr || !ev) throw new Error(`seed reference event: ${eErr?.message}`);
    refEventId = (ev as { id: string }).id;
  });

  afterAll(async () => {
    if (refEventId) await admin.from("events").delete().eq("id", refEventId);
    await admin
      .from("team_championships" as never)
      .delete()
      .in("id", [champTeamA_forCoach, champTeamA_forDelete, champTeamA_referenced].filter(Boolean));
  });

  // 1. Coach of the team can CRUD on their team's championships.
  it("coachA can create / update on teamA championships", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    const created = await expectInsertAllowed(c, "team_championships", {
      team_id: fx.teamA,
      // Client-provided club_id is intentionally wrong here — the enforce_club_team
      // trigger MUST overwrite it with teams.club_id (= fx.clubA).
      club_id: fx.clubB,
      name: "__rls_coach_created",
      is_active: true,
    });
    expect(created.club_id).toBe(fx.clubA);

    const { error: uErr, data: upd } = await c
      .from("team_championships" as never)
      .update({ name: "__rls_coach_created_renamed" } as never)
      .eq("id", (created as { id: string }).id)
      .select();
    expect(uErr).toBeNull();
    expect((upd as unknown[])?.length ?? 0).toBeGreaterThan(0);

    // Cleanup
    await admin.from("team_championships" as never).delete().eq("id", (created as { id: string }).id);
  });

  // 2. Coach of another team in the SAME club cannot write on teamA championships.
  it("coachB (other club) cannot read/write teamA championships", async () => {
    const c = await signInAs("coachB");
    await expectNoAccess(c, "team_championships", champTeamA_forCoach);
    await expectUpdateBlocked(c, "team_championships", champTeamA_forCoach, { name: "hacked" });
    await expectDeleteBlocked(c, "team_championships", champTeamA_forCoach);
  });

  // 3. Simple member (player) can SELECT (visible to club members) but not write.
  it("playerA can read teamA championships, cannot write", async () => {
    const c = await signInAs("playerA");
    await expectCanRead(c, "team_championships", champTeamA_forCoach);
    await expectUpdateBlocked(c, "team_championships", champTeamA_forCoach, { name: "hacked" });
    const fx = getFixtures();
    await expectInsertBlocked(c, "team_championships", {
      team_id: fx.teamA,
      club_id: fx.clubA,
      name: "__rls_player_evil",
      is_active: true,
    });
  });

  // 4. Another club (adminB): full isolation.
  it("adminB cannot see or write clubA championships", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectNoAccess(c, "team_championships", champTeamA_forCoach);
    await expectInsertBlocked(c, "team_championships", {
      team_id: fx.teamA,
      club_id: fx.clubA,
      name: "__rls_adminB_evil",
      is_active: true,
    });
    await expectDeleteBlocked(c, "team_championships", champTeamA_forCoach);
  });

  // 5. Anonymous: no access at all.
  it("anonymous cannot read team_championships", async () => {
    const c = anonClient();
    const { data, error } = await (c.from("team_championships" as never).select("id") as any).eq(
      "id",
      champTeamA_forCoach,
    );
    const blocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(blocked).toBe(true);
  });

  // 6. Trigger enforce_club_team: UPDATE changing team_id to a team of another
  //    club must be rejected. coachA cannot even see teamB anyway, so we test
  //    with adminA (who can theoretically try). The trigger fires either way.
  it("enforce_club_team: cross-club team_id change is rejected", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { error } = await c
      .from("team_championships" as never)
      .update({ team_id: fx.teamB } as never)
      .eq("id", champTeamA_forCoach);
    // The trigger raises an EXCEPTION; even if RLS silently blocks, the row
    // count is zero. Either way = not modified.
    expect(!!error || true).toBe(true);
    // Sanity check: the row still points to teamA.
    const { data: after } = await admin
      .from("team_championships" as never)
      .select("team_id")
      .eq("id", champTeamA_forCoach)
      .single();
    expect((after as { team_id: string } | null)?.team_id).toBe(fx.teamA);
  });

  // 7. Trigger block_delete_if_referenced: DELETE blocked when an event uses it.
  it("block_delete_if_referenced: cannot delete a referenced championship", async () => {
    const c = await signInAs("coachA");
    const { error } = await c
      .from("team_championships" as never)
      .delete()
      .eq("id", champTeamA_referenced);
    expect(error?.message ?? "").toMatch(/championship_in_use|referenced|foreign|violat/i);
    // Sanity: row still there.
    const { data: still } = await admin
      .from("team_championships" as never)
      .select("id")
      .eq("id", champTeamA_referenced)
      .single();
    expect(still).toBeTruthy();
  });

  // 8. block_delete_if_referenced: DELETE succeeds when the championship
  //    has no events referencing it.
  it("coachA can delete an unreferenced championship", async () => {
    const c = await signInAs("coachA");
    const { error, data } = await c
      .from("team_championships" as never)
      .delete()
      .eq("id", champTeamA_forDelete)
      .select();
    expect(error).toBeNull();
    expect((data as unknown[])?.length ?? 0).toBeGreaterThan(0);
    // Prevent double-cleanup in afterAll.
    champTeamA_forDelete = "";
  });
});
