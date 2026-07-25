/**
 * Parents linked via player_parents without club_members must appear in the
 * admin users list (Joueurs & parents) and be promotable (upsert membership).
 */
import { describe, it, expect } from "vitest";
import {
  mergeClubUsersList,
  splitClubUsersForAdminTabs,
  memberRolesFromRow,
  type ClubUserListItem,
  type ClubUserProfile,
} from "@/lib/admin-club-users";
import { mergeStaffWithNonStaffRoles, oldRolesForClubMemberUpsert } from "@/lib/club-member-roles";

function profile(id: string, name: string): ClubUserProfile {
  return {
    id,
    full_name: name,
    first_name: name.split(" ")[0] ?? null,
    last_name: name.split(" ").slice(1).join(" ") || null,
    phone: null,
    avatar_url: null,
  };
}

describe("memberRolesFromRow", () => {
  it("prefers roles[] over scalar role", () => {
    expect(memberRolesFromRow({ role: "coach", roles: ["admin", "parent"] })).toEqual([
      "admin",
      "parent",
    ]);
  });

  it("falls back to scalar role", () => {
    expect(memberRolesFromRow({ role: "parent", roles: [] })).toEqual(["parent"]);
    expect(memberRolesFromRow({ role: "coach", roles: null })).toEqual(["coach"]);
  });
});

describe("mergeClubUsersList", () => {
  it("includes a player_parents-only parent with roles=['parent'] and isClubMember false", () => {
    const profilesById = new Map<string, ClubUserProfile | null>([
      ["admin-1", profile("admin-1", "Ada Admin")],
      ["parent-orphan", profile("parent-orphan", "Christopher Garnier")],
    ]);
    const emailsById = new Map<string, string | null>([
      ["admin-1", "ada@club.test"],
      ["parent-orphan", "chris@example.com"],
    ]);

    const users = mergeClubUsersList({
      members: [{ user_id: "admin-1", role: "admin", roles: ["admin"] }],
      parentUserIds: ["parent-orphan"],
      profilesById,
      emailsById,
    });

    const orphan = users.find((u) => u.user_id === "parent-orphan");
    expect(orphan).toEqual({
      user_id: "parent-orphan",
      roles: ["parent"],
      profile: profilesById.get("parent-orphan"),
      email: "chris@example.com",
      isClubMember: false,
    });
  });

  it("dedupes: user in club_members AND player_parents keeps real roles + isClubMember true", () => {
    const profilesById = new Map<string, ClubUserProfile | null>([
      ["parent-member", profile("parent-member", "Pat Parent")],
    ]);
    const users = mergeClubUsersList({
      members: [{ user_id: "parent-member", role: "parent", roles: ["parent", "coach"] }],
      parentUserIds: ["parent-member", "parent-member"],
      profilesById,
      emailsById: new Map([["parent-member", "pat@club.test"]]),
    });

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      user_id: "parent-member",
      roles: ["parent", "coach"],
      isClubMember: true,
    });
  });

  it("never emits two rows for the same user_id", () => {
    const users = mergeClubUsersList({
      members: [
        { user_id: "u1", role: "admin", roles: ["admin"] },
        { user_id: "u1", role: "coach", roles: ["admin", "coach"] },
      ],
      parentUserIds: ["u1", "u2"],
      profilesById: new Map(),
      emailsById: new Map(),
    });
    const ids = users.map((u) => u.user_id);
    expect(ids).toEqual(Array.from(new Set(ids)));
    expect(users.find((u) => u.user_id === "u1")?.roles.sort()).toEqual(["admin", "coach"]);
  });
});

describe("splitClubUsersForAdminTabs", () => {
  const admin: ClubUserListItem = {
    user_id: "admin-1",
    roles: ["admin"],
    profile: null,
    email: null,
    isClubMember: true,
  };
  const coach: ClubUserListItem = {
    user_id: "coach-1",
    roles: ["coach"],
    profile: null,
    email: null,
    isClubMember: true,
  };
  const parentMember: ClubUserListItem = {
    user_id: "parent-m",
    roles: ["parent"],
    profile: null,
    email: null,
    isClubMember: true,
  };
  const orphanParent: ClubUserListItem = {
    user_id: "parent-o",
    roles: ["parent"],
    profile: null,
    email: null,
    isClubMember: false,
  };
  const player: ClubUserListItem = {
    user_id: "player-1",
    roles: ["player"],
    profile: null,
    email: null,
    isClubMember: true,
  };

  it("puts orphan parent in Joueurs & parents, never in Membres du club", () => {
    const { staff, playersParents } = splitClubUsersForAdminTabs([
      admin,
      coach,
      orphanParent,
      parentMember,
      player,
    ]);
    expect(staff.map((u) => u.user_id).sort()).toEqual(["admin-1", "coach-1"]);
    expect(playersParents.map((u) => u.user_id).sort()).toEqual([
      "parent-m",
      "parent-o",
      "player-1",
    ]);
    expect(staff.every((u) => u.isClubMember)).toBe(true);
    expect(playersParents.find((u) => u.user_id === "parent-o")?.isClubMember).toBe(false);
  });

  it("keeps existing staff identical (non-regression)", () => {
    const { staff, playersParents } = splitClubUsersForAdminTabs([admin, coach]);
    expect(staff).toHaveLength(2);
    expect(playersParents).toHaveLength(0);
  });
});

describe("setClubMemberRoles upsert seeding", () => {
  it("seeds oldRoles with ['parent'] when creating a membership", () => {
    expect(oldRolesForClubMemberUpsert(null, true)).toEqual(["parent"]);
    expect(oldRolesForClubMemberUpsert(undefined, true)).toEqual(["parent"]);
  });

  it("keeps existing roles when updating", () => {
    expect(oldRolesForClubMemberUpsert(["parent", "player"], false)).toEqual(["parent", "player"]);
    expect(oldRolesForClubMemberUpsert(null, false)).toEqual([]);
  });

  it("preserves parent when promoting orphan parent to coach", () => {
    const oldRoles = oldRolesForClubMemberUpsert(null, true);
    const merged = mergeStaffWithNonStaffRoles(["coach"], oldRoles);
    expect(merged.sort()).toEqual(["coach", "parent"]);
  });

  it("preserves incompatible-role merge behaviour for existing members", () => {
    const merged = mergeStaffWithNonStaffRoles(["coach"], ["parent", "player"]);
    expect(merged.sort()).toEqual(["coach", "parent", "player"]);
  });

  it("does not invent parent when updating a staff-only member", () => {
    const oldRoles = oldRolesForClubMemberUpsert(["admin"], false);
    const merged = mergeStaffWithNonStaffRoles(["admin", "coach"], oldRoles);
    expect(merged.sort()).toEqual(["admin", "coach"]);
  });
});
