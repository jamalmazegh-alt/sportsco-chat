import { describe, it } from "vitest";
import { anonClient } from "./_clients";
import { getFixtures } from "./_setup";
import { expectNoAccess, expectInsertBlocked } from "./_helpers";

describe("RLS: anonymous access", () => {
  it("anon cannot read clubs", async () => {
    const c = anonClient();
    await expectNoAccess(c, "clubs", getFixtures().clubA);
  });

  it("anon cannot read players", async () => {
    const c = anonClient();
    await expectNoAccess(c, "players", getFixtures().playerA);
  });

  it("anon cannot read events", async () => {
    const c = anonClient();
    await expectNoAccess(c, "events", getFixtures().eventA);
  });

  it("anon cannot read convocations", async () => {
    const c = anonClient();
    await expectNoAccess(c, "convocations", getFixtures().convocationA);
  });

  it("anon cannot read notifications", async () => {
    const c = anonClient();
    await expectNoAccess(c, "notifications", getFixtures().notificationA);
  });

  it("anon cannot read subscriptions", async () => {
    const c = anonClient();
    await expectNoAccess(c, "subscriptions", getFixtures().subscriptionA);
  });

  it("anon cannot read support_tickets", async () => {
    const c = anonClient();
    await expectNoAccess(c, "support_tickets", getFixtures().ticketA);
  });

  it("anon cannot read profiles", async () => {
    const c = anonClient();
    await expectNoAccess(c, "profiles", getFixtures().users.adminA.userId);
  });

  it("anon cannot read audit_logs", async () => {
    const c = anonClient();
    await expectNoAccess(c, "audit_logs", getFixtures().auditLogA);
  });

  it("anon cannot insert a ticket", async () => {
    const c = anonClient();
    await expectInsertBlocked(c, "support_tickets", {
      user_id: getFixtures().users.adminA.userId,
      subject: "anon_spam",
      description: "spam",
    });
  });
});
