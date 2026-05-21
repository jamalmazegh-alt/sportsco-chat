import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectDeleteBlocked,
} from "./_helpers";

describe("RLS: super_admins", () => {
  it("self sees their own super_admin row", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    const { data } = await c
      .from("super_admins")
      .select("user_id")
      .eq("user_id", fx.users.superadmin.userId);
    if (!data || data.length === 0) {
      throw new Error("superadmin should see own row");
    }
  });

  it("non-super cannot see anyone's super_admin row", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { data } = await c
      .from("super_admins")
      .select("user_id")
      .eq("user_id", fx.users.superadmin.userId);
    if (data && data.length > 0) {
      throw new Error("Non-super should NOT see super_admins rows");
    }
  });

  it("non-super cannot promote themselves to super", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectInsertBlocked(c, "super_admins", {
      user_id: fx.users.adminA.userId,
    });
  });

  it("non-super cannot delete a super_admin row", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { data, error } = await c
      .from("super_admins")
      .delete()
      .eq("user_id", fx.users.superadmin.userId)
      .select();
    const blocked = !!error || !data || data.length === 0;
    if (!blocked) throw new Error("Non-super should NOT delete super_admins rows");
  });
});

describe("RLS: cross-cutting role escalation", () => {
  it("playerA cannot insert themselves as admin in clubA", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectInsertBlocked(c, "club_members", {
      club_id: fx.clubA,
      user_id: fx.users.playerA.userId,
      role: "admin",
    });
  });

  it("coachA cannot insert themselves as admin in clubA", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    await expectInsertBlocked(c, "club_members", {
      club_id: fx.clubA,
      user_id: fx.users.coachA.userId,
      role: "admin",
    });
  });

  it("adminA cannot insert themselves as super_admin", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectInsertBlocked(c, "super_admins", {
      user_id: fx.users.adminA.userId,
    });
  });
});
