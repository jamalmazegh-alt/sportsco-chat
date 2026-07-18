/**
 * LOT 0 — Groupes personnalisés & resolver d'audience.
 *
 * Invariants testés :
 *  - Staff-only : admin/coach lisent et écrivent ; player/parent ne voient
 *    AUCUNE ligne (composition des groupes lisible staff-only).
 *  - Isolation cross-club : staff club A ne voit ni les groupes ni la
 *    composition du club B.
 *  - Resolver `resolve_audience_members` :
 *      * ne persiste aucune ligne pour une audience système,
 *      * dédoublonne (un user dans 2 audiences = 1 seul retour),
 *      * refuse silencieusement un team_id/group_id/event_id étranger,
 *      * inclut correctement les membres d'un groupe custom.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { admin } from "./_admin";
import { signInAs, anonClient } from "./_clients";
import { getFixtures } from "./_setup";
import { expectNoAccess } from "./_helpers";

describe("club_groups & resolver (Lot 0)", () => {
  let groupA: string; // CODIR clubA
  let groupB: string; // CODIR clubB
  let memberAdminA_id: string;
  let memberCoachA_id: string;

  beforeAll(async () => {
    const fx = getFixtures();

    // Look up club_members.id for adminA/coachA/adminB
    const { data: cmA } = await admin
      .from("club_members")
      .select("id, user_id")
      .eq("club_id", fx.clubA)
      .in("user_id", [fx.users.adminA.userId, fx.users.coachA.userId]);
    memberAdminA_id = cmA!.find((r) => r.user_id === fx.users.adminA.userId)!.id;
    memberCoachA_id = cmA!.find((r) => r.user_id === fx.users.coachA.userId)!.id;

    const { data: cmB } = await admin
      .from("club_members")
      .select("id, user_id")
      .eq("club_id", fx.clubB)
      .eq("user_id", fx.users.adminB.userId)
      .single();
    const memberAdminB_id = cmB!.id;

    // Seed one group per club with 2 / 1 member
    const { data: gA } = await admin
      .from("club_groups")
      .insert({
        club_id: fx.clubA,
        name: `__rls_${fx.runId}_CODIR_A`,
        created_by: fx.users.adminA.userId,
      })
      .select("id")
      .single();
    groupA = gA!.id;

    const { data: gB } = await admin
      .from("club_groups")
      .insert({
        club_id: fx.clubB,
        name: `__rls_${fx.runId}_CODIR_B`,
        created_by: fx.users.adminB.userId,
      })
      .select("id")
      .single();
    groupB = gB!.id;

    await admin.from("club_group_members").insert([
      { group_id: groupA, member_id: memberAdminA_id, added_by: fx.users.adminA.userId },
      { group_id: groupA, member_id: memberCoachA_id, added_by: fx.users.adminA.userId },
      { group_id: groupB, member_id: memberAdminB_id, added_by: fx.users.adminB.userId },
    ]);
  });

  // ---------- Visibility ---------------------------------------------------

  it("staff (admin/coach) can list club_groups of their own club", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");
    const cCoach = await signInAs("coachA");

    const { data: aRows, error: aErr } = await cAdmin
      .from("club_groups")
      .select("id")
      .eq("club_id", fx.clubA);
    expect(aErr).toBeNull();
    expect((aRows ?? []).map((r) => r.id)).toContain(groupA);

    const { data: coachRows } = await cCoach
      .from("club_groups")
      .select("id")
      .eq("club_id", fx.clubA);
    expect((coachRows ?? []).map((r) => r.id)).toContain(groupA);
  });

  it("player/parent CANNOT read any club_groups row (staff-only)", async () => {
    const cPlayer = await signInAs("playerA");
    const cParent = await signInAs("parentA");

    for (const client of [cPlayer, cParent]) {
      await expectNoAccess(client, "club_groups", groupA);
      const { data } = await client.from("club_groups").select("id");
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("player/parent CANNOT read club_group_members (composition invisible)", async () => {
    const cPlayer = await signInAs("playerA");
    const cParent = await signInAs("parentA");
    for (const client of [cPlayer, cParent]) {
      const { data } = await client.from("club_group_members").select("id");
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("staff club A cannot read club_groups of club B", async () => {
    const cAdmin = await signInAs("adminA");
    await expectNoAccess(cAdmin, "club_groups", groupB);
    const { data } = await cAdmin.from("club_group_members").select("id").eq("group_id", groupB);
    expect(data ?? []).toHaveLength(0);
  });

  // ---------- Writes -------------------------------------------------------

  it("player cannot create a group in their club", async () => {
    const fx = getFixtures();
    const cPlayer = await signInAs("playerA");
    const { error } = await cPlayer.from("club_groups").insert({
      club_id: fx.clubA,
      name: "hostile",
      created_by: fx.users.playerA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("staff club A cannot create a group inside club B", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");
    const { error } = await cAdmin.from("club_groups").insert({
      club_id: fx.clubB,
      name: "hostile-cross-club",
      created_by: fx.users.adminA.userId,
    });
    expect(error).not.toBeNull();
  });

  // ---------- Resolver -----------------------------------------------------

  it("resolver returns the group's members and does not persist rows", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");

    // Snapshot row counts BEFORE call: no system-audience should create rows.
    const { count: gmCountBefore } = await admin
      .from("club_group_members")
      .select("*", { count: "exact", head: true });

    const { data, error } = await cAdmin.rpc("resolve_audience_members", {
      _club_id: fx.clubA,
      _spec: [{ type: "club_group", group_id: groupA }],
    });
    expect(error).toBeNull();
    const uids = (data ?? []).map((r: { user_id: string }) => r.user_id).sort();
    expect(uids).toEqual([fx.users.adminA.userId, fx.users.coachA.userId].sort());

    const { count: gmCountAfter } = await admin
      .from("club_group_members")
      .select("*", { count: "exact", head: true });
    expect(gmCountAfter).toBe(gmCountBefore);
  });

  it("resolver dedups when a user is in multiple audiences", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");
    // adminA is in club_staff AND in groupA → still 1 occurrence
    const { data, error } = await cAdmin.rpc("resolve_audience_members", {
      _club_id: fx.clubA,
      _spec: [{ type: "club_staff" }, { type: "club_group", group_id: groupA }],
    });
    expect(error).toBeNull();
    const uids = (data ?? []).map((r: { user_id: string }) => r.user_id);
    const seen = new Set(uids);
    expect(uids.length).toBe(seen.size);
    expect(seen.has(fx.users.adminA.userId)).toBe(true);
  });

  it("resolver refuses cross-club group_id (silent empty)", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");
    const { data, error } = await cAdmin.rpc("resolve_audience_members", {
      _club_id: fx.clubA,
      _spec: [{ type: "club_group", group_id: groupB }],
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("resolver refuses cross-club team_id (silent empty)", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");
    const { data, error } = await cAdmin.rpc("resolve_audience_members", {
      _club_id: fx.clubA,
      _spec: [{ type: "team_players", team_id: fx.teamB }],
    });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("resolver includes team players for own club", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");
    const { data, error } = await cAdmin.rpc("resolve_audience_members", {
      _club_id: fx.clubA,
      _spec: [{ type: "team_players", team_id: fx.teamA }],
    });
    expect(error).toBeNull();
    const uids = (data ?? []).map((r: { user_id: string }) => r.user_id);
    expect(uids).toContain(fx.users.playerA.userId);
  });
});
