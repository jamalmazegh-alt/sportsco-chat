/**
 * RLS: product_activity_log
 *
 * Table is superadmin-read-only and service_role-write-only. No other role
 * should be able to SELECT or INSERT directly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { admin } from "./_admin";
import { anonClient, signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import { expectNoAccess, expectInsertBlocked } from "./_helpers";

describe("RLS: product_activity_log", () => {
  let rowId: string;

  beforeAll(async () => {
    const fx = getFixtures();
    const { data, error } = await admin
      .from("product_activity_log")
      .insert({
        club_id: fx.clubA,
        actor_user_id: fx.users.adminA.userId,
        actor_role: "admin",
        category: "event",
        action_type: "event.created",
        resource_type: "event",
        resource_id: fx.eventA,
        status: "success",
        metadata: { seed: true },
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seed failed: ${error?.message}`);
    rowId = data.id;
  });

  afterAll(async () => {
    if (rowId) await admin.from("product_activity_log").delete().eq("id", rowId);
  });

  it("service_role can read the seeded row (sanity)", async () => {
    const { data, error } = await admin
      .from("product_activity_log")
      .select("id")
      .eq("id", rowId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("anon cannot read product_activity_log", async () => {
    await expectNoAccess(anonClient(), "product_activity_log", rowId);
  });

  it("authenticated non-superadmin (adminA) cannot read", async () => {
    const c = await signInAs("adminA");
    await expectNoAccess(c, "product_activity_log", rowId);
  });

  it("authenticated non-superadmin (playerA) cannot read", async () => {
    const c = await signInAs("playerA");
    await expectNoAccess(c, "product_activity_log", rowId);
  });

  it("superadmin CAN read", async () => {
    const c = await signInAs("superadmin");
    const { data, error } = await c
      .from("product_activity_log")
      .select("id")
      .eq("id", rowId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("anon cannot insert", async () => {
    const fx = getFixtures();
    await expectInsertBlocked(anonClient(), "product_activity_log", {
      club_id: fx.clubA,
      category: "event",
      action_type: "event.created",
      status: "success",
    });
  });

  it("authenticated non-superadmin (adminA) cannot insert", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectInsertBlocked(c, "product_activity_log", {
      club_id: fx.clubA,
      actor_user_id: fx.users.adminA.userId,
      category: "event",
      action_type: "event.created",
      status: "success",
    });
  });

  it("superadmin cannot insert directly (writes reserved to service_role)", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    await expectInsertBlocked(c, "product_activity_log", {
      club_id: fx.clubA,
      category: "event",
      action_type: "event.created",
      status: "success",
    });
  });
});
