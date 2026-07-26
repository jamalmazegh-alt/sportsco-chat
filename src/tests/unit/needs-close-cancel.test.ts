import { describe, it, expect } from "vitest";
import { planCloseNeed, planCancelNeed, type SignupLike } from "@/lib/needs/close-cancel-plan";

const s = (
  id: string,
  status: SignupLike["status"],
  user_id: string | null = `u-${id}`,
): SignupLike => ({ id, user_id, status });

describe("planCloseNeed", () => {
  it("declines only 'applied' — 'confirmed' left untouched", () => {
    const plan = planCloseNeed([
      s("a", "applied"),
      s("c", "confirmed"),
      s("w", "withdrawn"),
      s("u", "unavailable"),
      s("d", "declined"),
    ]);
    expect(plan.toDecline).toEqual(["a"]);
    expect(plan.toNotify.map((n) => n.signupId)).toEqual(["a"]);
  });

  it("skips notifications for signups without a user_id", () => {
    const plan = planCloseNeed([s("a1", "applied", null), s("a2", "applied", "u2")]);
    expect(plan.toDecline.sort()).toEqual(["a1", "a2"]);
    expect(plan.toNotify).toEqual([{ signupId: "a2", userId: "u2" }]);
  });

  it("no 'applied' → empty plan (no-op close)", () => {
    const plan = planCloseNeed([s("c", "confirmed"), s("w", "withdrawn")]);
    expect(plan.toDecline).toEqual([]);
    expect(plan.toNotify).toEqual([]);
  });
});

describe("planCancelNeed", () => {
  it("notifies confirmed + applied, deduplicated by user_id", () => {
    const plan = planCancelNeed([
      s("a", "applied", "u1"),
      s("b", "confirmed", "u2"),
      s("c", "confirmed", "u1"), // dup with signup a
      s("d", "withdrawn", "u3"),
      s("e", "unavailable", "u4"),
      s("f", "declined", "u5"),
    ]);
    expect(plan.toNotifyUserIds.sort()).toEqual(["u1", "u2"]);
  });

  it("ignores signups without user_id", () => {
    const plan = planCancelNeed([s("a", "applied", null), s("b", "confirmed", "u2")]);
    expect(plan.toNotifyUserIds).toEqual(["u2"]);
  });

  it("no eligible signups → empty list", () => {
    const plan = planCancelNeed([s("a", "withdrawn"), s("b", "declined")]);
    expect(plan.toNotifyUserIds).toEqual([]);
  });
});
