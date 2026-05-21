import { describe, it, expect } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import { expectCanRead, expectNoAccess, expectInsertBlocked } from "./_helpers";

describe("RLS: support_messages", () => {
  it("ticket owner reads their messages", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "support_messages", fx.messageA);
  });

  it("other user cannot read messages from someone else's ticket", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectNoAccess(c, "support_messages", fx.messageA);
  });

  it("ticket owner can add a user message", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { data, error } = await c
      .from("support_messages")
      .insert({
        ticket_id: fx.ticketA,
        sender_id: fx.users.adminA.userId,
        sender_role: "user",
        body: "reply",
      })
      .select()
      .single();
    expect(error).toBeNull();
    if (data) await c.from("support_messages").delete().eq("id", data.id);
  });

  it("non-superadmin cannot create internal_note", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectInsertBlocked(c, "support_messages", {
      ticket_id: fx.ticketA,
      sender_id: fx.users.adminA.userId,
      sender_role: "user",
      body: "secret",
      is_internal_note: true,
    });
  });

  it("non-superadmin cannot create message with staff sender_role", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectInsertBlocked(c, "support_messages", {
      ticket_id: fx.ticketA,
      sender_id: fx.users.adminA.userId,
      sender_role: "staff",
      body: "impersonate staff",
    });
  });

  it("superadmin can create internal_note", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    const { data, error } = await c
      .from("support_messages")
      .insert({
        ticket_id: fx.ticketA,
        sender_id: fx.users.superadmin.userId,
        sender_role: "staff",
        body: "internal",
        is_internal_note: true,
      })
      .select()
      .single();
    expect(error).toBeNull();
    if (data) await c.from("support_messages").delete().eq("id", data.id);
  });

  it("user cannot see internal_notes even on own ticket", async () => {
    const fx = getFixtures();
    // Seed internal note via superadmin
    const cSuper = await signInAs("superadmin");
    const { data: note } = await cSuper
      .from("support_messages")
      .insert({
        ticket_id: fx.ticketA,
        sender_id: fx.users.superadmin.userId,
        sender_role: "staff",
        body: "hidden internal",
        is_internal_note: true,
      })
      .select()
      .single();

    try {
      const cUser = await signInAs("adminA");
      await expectNoAccess(cUser, "support_messages", note!.id);
    } finally {
      if (note) await cSuper.from("support_messages").delete().eq("id", note.id);
    }
  });
});
