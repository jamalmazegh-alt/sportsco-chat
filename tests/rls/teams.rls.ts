import { describe, it } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import {
  expectCanRead,
  expectNoAccess,
  expectUpdateBlocked,
  expectInsertBlocked,
} from "./_helpers";

describe("RLS: teams", () => {
  it("adminA sees teamA, not teamB", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminA");
    await expectCanRead(c, "teams", fx.teamA);
    await expectNoAccess(c, "teams", fx.teamB);
  });

  it("coachA sees teamA", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    await expectCanRead(c, "teams", fx.teamA);
    await expectNoAccess(c, "teams", fx.teamB);
  });

  it("playerA sees own team only", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectCanRead(c, "teams", fx.teamA);
    await expectNoAccess(c, "teams", fx.teamB);
  });

  it("coachA cannot update teamA (admin-only)", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    await expectUpdateBlocked(c, "teams", fx.teamA, { name: "hacked" });
  });

  it("adminB cannot create a team in clubA", async () => {
    const fx = getFixtures();
    const c = await signInAs("adminB");
    await expectInsertBlocked(c, "teams", {
      club_id: fx.clubA,
      name: "__rls_evil_team",
    });
  });
});
