/**
 * Smoke test: verifies the global setup seeded fixtures, signInAs works,
 * and basic role-scoped reads behave as expected.
 *
 * If this passes, the rest of the RLS suites can rely on the infrastructure.
 */
import { describe, it, expect } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import { expectCanRead, expectNoAccess } from "./_helpers";

describe("RLS smoke — infrastructure", () => {
  it("fixtures are seeded", () => {
    const fx = getFixtures();
    expect(fx.runId).toBeTruthy();
    expect(fx.clubA).toBeTruthy();
    expect(fx.clubB).toBeTruthy();
    expect(Object.keys(fx.users)).toHaveLength(8);
  });

  it("adminA can sign in", async () => {
    const c = await signInAs("adminA");
    const { data } = await c.auth.getUser();
    expect(data.user?.id).toBe(getFixtures().users.adminA.userId);
  });

  it("adminA reads their own club", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "clubs", fx.clubA);
  });

  it("adminA cannot read clubB", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectNoAccess(c, "clubs", fx.clubB);
  });

  it("superadmin can read both clubs", async () => {
    const fx = getFixtures();
    const c = await signInAs("superadmin");
    await expectCanRead(c, "clubs", fx.clubA);
    await expectCanRead(c, "clubs", fx.clubB);
  });
});
