import { describe, it, expect } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import { expectCanRead, expectUpdateBlocked, expectInsertBlocked } from "./_helpers";

describe("RLS: profiles", () => {
  it("user reads own profile", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "profiles", fx.users.adminA.userId);
  });

  it("clubmate reads clubmate's profile", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectCanRead(c, "profiles", fx.users.adminA.userId);
  });

  it("non-clubmate cannot read profile", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerB");
    const { data } = await c
      .from("profiles")
      .select("id")
      .eq("id", fx.users.adminA.userId);
    expect(data ?? []).toHaveLength(0);
  });

  it("user cannot update someone else's profile", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectUpdateBlocked(c, "profiles", fx.users.adminA.userId, {
      full_name: "hacked",
    });
  });

  it("user can update own profile", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerB");
    const { data, error } = await c
      .from("profiles")
      .update({ full_name: "Self Updated" })
      .eq("id", fx.users.playerB.userId)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(`Self update failed: ${error?.message}`);
    }
  });

  it("user cannot insert a profile with someone else's id", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectInsertBlocked(c, "profiles", {
      id: fx.users.adminB.userId,
      full_name: "ghost",
    });
  });
});
