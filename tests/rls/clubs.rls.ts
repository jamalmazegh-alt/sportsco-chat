import { describe, it } from "vitest";
import { signInAs, anonClient } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectUpdateBlocked,
  expectDeleteBlocked,
  expectInsertAllowed,
} from "./_helpers";

describe("RLS: clubs", () => {
  it("adminA reads clubA, not clubB", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "clubs", fx.clubA);
    await expectNoAccess(c, "clubs", fx.clubB);
  });

  it("playerA reads own club", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectCanRead(c, "clubs", fx.clubA);
    await expectNoAccess(c, "clubs", fx.clubB);
  });

  it("playerA cannot update or delete clubA", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectUpdateBlocked(c, "clubs", fx.clubA, { name: "hacked" });
    await expectDeleteBlocked(c, "clubs", fx.clubA);
  });

  it("adminB cannot update clubA", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectUpdateBlocked(c, "clubs", fx.clubA, { name: "hacked" });
  });

  it("user can insert a club only if created_by = self", async () => {
    const c = await signInAs("playerA");
    const fx = getFixtures();
    await expectInsertBlocked(c, "clubs", {
      name: `__rls_hack_${Date.now()}`,
      created_by: fx.users.adminB.userId,
    });
    // Allowed if created_by = self — but we clean up immediately
    const row = await expectInsertAllowed(c, "clubs", {
      name: `__rls_owned_${Date.now()}`,
      created_by: fx.users.playerA.userId,
    });
    // Cleanup via admin (service role) is done by global teardown? No — this
    // row isn't tracked. Delete inline as the owner-admin.
    await c.from("clubs").delete().eq("id", row.id);
  });

  it("superadmin reads both clubs", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    await expectCanRead(c, "clubs", fx.clubA);
    await expectCanRead(c, "clubs", fx.clubB);
  });

  it("anonymous cannot read clubs", async () => {
    const fx = getFixtures();
    const c = anonClient();
    await expectNoAccess(c, "clubs", fx.clubA);
  });
});
