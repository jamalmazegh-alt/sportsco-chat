import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectInsertBlocked,
  expectUpdateBlocked,
  expectDeleteBlocked,
} from "./_helpers";

describe("RLS: subscriptions", () => {
  it("adminA reads own club subscription", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "subscriptions", fx.subscriptionA);
  });

  it("playerA cannot read club subscription", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectNoAccess(c, "subscriptions", fx.subscriptionA);
  });

  it("coachA cannot read club subscription", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    await expectNoAccess(c, "subscriptions", fx.subscriptionA);
  });

  it("adminB cannot read clubA subscription", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectNoAccess(c, "subscriptions", fx.subscriptionA);
  });

  it("adminA cannot INSERT a subscription (no INSERT policy)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectInsertBlocked(c, "subscriptions", {
      club_id: fx.clubA,
      status: "active",
    });
  });

  it("adminA cannot UPDATE the subscription (only Stripe webhook can)", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectUpdateBlocked(c, "subscriptions", fx.subscriptionA, {
      status: "active",
    });
  });

  it("adminA cannot DELETE the subscription", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectDeleteBlocked(c, "subscriptions", fx.subscriptionA);
  });
});
