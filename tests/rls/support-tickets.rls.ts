import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectUpdateBlocked,
  expectDeleteBlocked,
  expectInsertAllowed,
} from "./_helpers";

describe("RLS: support_tickets", () => {
  it("adminA reads own ticket", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "support_tickets", fx.ticketA);
  });

  it("playerA cannot read adminA's ticket", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectNoAccess(c, "support_tickets", fx.ticketA);
  });

  it("adminB cannot read adminA's ticket (cross-club)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectNoAccess(c, "support_tickets", fx.ticketA);
  });

  it("superadmin reads all tickets", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    await expectCanRead(c, "support_tickets", fx.ticketA);
    await expectCanRead(c, "support_tickets", fx.ticketSuperOnly);
  });

  it("only the owner can create a ticket for themselves", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectInsertBlocked(c, "support_tickets", {
      user_id: fx.users.adminA.userId,
      subject: "__rls_impersonate",
      description: "hack",
    });
    const own = await expectInsertAllowed(c, "support_tickets", {
      user_id: fx.users.playerA.userId,
      subject: "__rls_own",
      description: "ok",
    });
    await c.from("support_tickets").delete().eq("id", own.id);
  });

  it("non-superadmin cannot UPDATE ticket status", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectUpdateBlocked(c, "support_tickets", fx.ticketA, {
      status: "closed",
    });
  });

  it("superadmin can update ticket status", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    const { data, error } = await c
      .from("support_tickets")
      .update({ status: "in_progress" })
      .eq("id", fx.ticketA)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(`Superadmin should update: ${error?.message}`);
    }
  });

  it("nobody can DELETE a ticket", async () => {
    const fx = getFixtures();
    const cAdmin = await signInAs("adminA");
    const cSuper = await signInAs("superadmin");
    await expectDeleteBlocked(cAdmin, "support_tickets", fx.ticketA);
    await expectDeleteBlocked(cSuper, "support_tickets", fx.ticketA);
  });
});
