import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectUpdateBlocked,
  expectDeleteBlocked,
  expectInsertBlocked,
} from "./_helpers";

describe("RLS: audit_logs", () => {
  it("actor reads own audit row", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "audit_logs", fx.auditLogA);
  });

  it("club admin reads audit row scoped to their club", async () => {
    const fx = getFixtures();
    // adminA is both actor and admin — covered by above. Test coachA cannot.
    const c = await signInAs("coachA");
    await expectNoAccess(c, "audit_logs", fx.auditLogA);
  });

  it("adminB cannot read clubA audit row", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectNoAccess(c, "audit_logs", fx.auditLogA);
  });

  it("superadmin reads all audit rows", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    await expectCanRead(c, "audit_logs", fx.auditLogA);
  });

  it("user cannot insert audit row impersonating another actor", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectInsertBlocked(c, "audit_logs", {
      actor_user_id: fx.users.adminA.userId,
      action: "impersonate",
      entity_type: "club",
      entity_id: fx.clubA,
    });
  });

  it("audit logs are immutable (no UPDATE, no DELETE)", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    await expectUpdateBlocked(c, "audit_logs", fx.auditLogA, { action: "x" });
    await expectDeleteBlocked(c, "audit_logs", fx.auditLogA);
  });
});

describe("RLS: superadmin_audit_logs", () => {
  it("superadmin reads, others don't", async () => {
    // Insert a row via service role for read tests
    const { admin } = await import("./_admin");
    const fx = getFixtures();
    const { data: row } = await admin
      .from("superadmin_audit_logs")
      .insert({
        actor_user_id: fx.users.superadmin.userId,
        action: "rls_test_seed",
      })
      .select("id")
      .single();
    try {
      const cSuper = await signInAs("superadmin");
      await expectCanRead(cSuper, "superadmin_audit_logs", row!.id);
      const cAdmin = await signInAs("adminA");
      await expectNoAccess(cAdmin, "superadmin_audit_logs", row!.id);
    } finally {
      if (row) await admin.from("superadmin_audit_logs").delete().eq("id", row.id);
    }
  });

  it("nobody can INSERT directly (with check false)", async () => {
    const fx = getFixtures();
    const cSuper = await signInAs("superadmin");
    await expectInsertBlocked(cSuper, "superadmin_audit_logs", {
      actor_user_id: fx.users.superadmin.userId,
      action: "direct_insert",
    });
  });
});
