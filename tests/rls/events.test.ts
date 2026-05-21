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

describe("RLS: events", () => {
  it("coachA reads eventA, not eventB", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    await expectCanRead(c, "events", fx.eventA);
    await expectNoAccess(c, "events", fx.eventB);
  });

  it("playerA reads own team's event", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectCanRead(c, "events", fx.eventA);
    await expectNoAccess(c, "events", fx.eventB);
  });

  it("playerA cannot update or delete an event", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectUpdateBlocked(c, "events", fx.eventA, { title: "hacked" });
    await expectDeleteBlocked(c, "events", fx.eventA);
  });

  it("coachB cannot read eventA", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachB");
    await expectNoAccess(c, "events", fx.eventA);
  });

  it("coachB cannot create an event in teamA", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachB");
    await expectInsertBlocked(c, "events", {
      team_id: fx.teamA,
      title: "__rls_evil",
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      type: "training",
      created_by: fx.users.coachB.userId,
    });
  });
});
