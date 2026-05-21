import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectInsertAllowed,
  expectDeleteBlocked,
} from "./_helpers";

describe("RLS: data_export_requests", () => {
  it("owner reads own request", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "data_export_requests", fx.exportRequestA);
  });

  it("other user cannot read someone else's request", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectNoAccess(c, "data_export_requests", fx.exportRequestA);
  });

  it("superadmin reads all", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    await expectCanRead(c, "data_export_requests", fx.exportRequestA);
  });

  it("user cannot create a request for someone else", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectInsertBlocked(c, "data_export_requests", {
      user_id: fx.users.adminA.userId,
    });
  });

  it("user can create own request", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerB");
    const row = await expectInsertAllowed(c, "data_export_requests", {
      user_id: fx.users.playerB.userId,
    });
    // Service-role cleanup (no DELETE policy)
    const { admin } = await import("./_admin");
    await admin.from("data_export_requests").delete().eq("id", row.id);
  });

  it("nobody can DELETE (no policy)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectDeleteBlocked(c, "data_export_requests", fx.exportRequestA);
  });
});

describe("RLS: account_deletion_requests", () => {
  it("owner reads own deletion request", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "account_deletion_requests", fx.deletionRequestA);
  });

  it("other user cannot read", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectNoAccess(c, "account_deletion_requests", fx.deletionRequestA);
  });

  it("cannot insert deletion request for another user", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectInsertBlocked(c, "account_deletion_requests", {
      user_id: fx.users.adminA.userId,
    });
  });

  it("owner can cancel (UPDATE) own request", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { data, error } = await c
      .from("account_deletion_requests")
      .update({ status: "cancelled" })
      .eq("id", fx.deletionRequestA)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(`Owner cancel failed: ${error?.message}`);
    }
  });

  it("nobody can DELETE", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectDeleteBlocked(c, "account_deletion_requests", fx.deletionRequestA);
  });
});
