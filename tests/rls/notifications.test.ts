import { describe, it, expect } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectUpdateBlocked,
} from "./_helpers";

describe("RLS: notifications", () => {
  it("adminA reads own notification", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "notifications", fx.notificationA);
  });

  it("playerA cannot read adminA's notification", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectNoAccess(c, "notifications", fx.notificationA);
  });

  it("adminB cannot read adminA's notification (cross-club)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectNoAccess(c, "notifications", fx.notificationA);
  });

  it("adminA can mark own notification as read", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    const { data, error } = await c
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", fx.notificationA)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(`Owner should update: ${error?.message}`);
    }
  });

  it("playerA cannot update adminA's notification", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectUpdateBlocked(c, "notifications", fx.notificationA, {
      read_at: new Date().toISOString(),
    });
  });

  it("clubmate can insert a notification for adminA", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    const { data, error } = await c
      .from("notifications")
      .insert({
        user_id: fx.users.adminA.userId,
        type: "test",
        title: "__rls_test",
      })
      .select()
      .single();
    expect(error).toBeNull();
    if (data) await c.from("notifications").delete().eq("id", data.id);
  });

  it("non-clubmate cannot insert a notification for adminA", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectInsertBlocked(c, "notifications", {
      user_id: fx.users.adminA.userId,
      type: "spam",
      title: "__rls_spam",
    });
  });
});
