import { describe, it, expect } from "vitest";
import { signInAs } from "./_clients";
import { getFixtures } from "./_setup";
import { expectCanRead, expectNoAccess } from "./_helpers";

describe("RLS: convocations", () => {
  it("coachA reads convocation for eventA", async () => {
    const fx = getFixtures();
    const c = await signInAs("coachA");
    await expectCanRead(c, "convocations", fx.convocationA);
  });

  it("playerA reads their own convocation", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    await expectCanRead(c, "convocations", fx.convocationA);
  });

  it("playerB cannot read playerA's convocation", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerB");
    await expectNoAccess(c, "convocations", fx.convocationA);
  });

  it("playerA can respond to their own convocation", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerA");
    const { data, error } = await c
      .from("convocations")
      .update({ status: "present" })
      .eq("id", fx.convocationA)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(`Player should respond: ${error?.message}`);
    }
  });

  it("parentA can respond on behalf of playerA", async () => {
    const fx = getFixtures();
    const c = await signInAs("parentA");
    const { data, error } = await c
      .from("convocations")
      .update({ status: "absent" })
      .eq("id", fx.convocationA)
      .select();
    if (error || !data || data.length === 0) {
      throw new Error(`Parent should respond: ${error?.message}`);
    }
  });

  it("playerB cannot respond to playerA's convocation", async () => {
    const fx = getFixtures();
    const c = await signInAs("playerB");
    const { data, error } = await c
      .from("convocations")
      .update({ status: "present" })
      .eq("id", fx.convocationA)
      .select();
    const blocked = !!error || !data || data.length === 0;
    expect(blocked).toBe(true);
  });
});
