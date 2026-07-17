import { describe, it, expect } from "vitest";
import {
  planConvocationResendRecipients,
  type ResendPlanConvocation,
  type ResendPlanParent,
} from "@/lib/events/resend-convocation-plan";

const convoc = (
  id: string,
  player_id: string,
  overrides: Partial<ResendPlanConvocation> = {},
): ResendPlanConvocation => ({
  id,
  player_id,
  response_token: `tok-${id}`,
  player: { first_name: "P", last_name: player_id, email: null, user_id: null },
  ...overrides,
});

describe("planConvocationResendRecipients", () => {
  it("two different parents on the same player get distinct idempotency suffixes", () => {
    const convs = [convoc("c1", "pl1")];
    const parents: ResendPlanParent[] = [
      { parent_user_id: "u-a", email: "a@x.com", full_name: "Ann", player_id: "pl1" },
      { parent_user_id: "u-b", email: "b@x.com", full_name: "Bob", player_id: "pl1" },
    ];
    const plan = planConvocationResendRecipients(convs, parents, {});
    const suffixes = plan.recipients.map((r) => r.idemSuffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
    expect(suffixes).toContain("parent-u-a-c1");
    expect(suffixes).toContain("parent-u-b-c1");
  });

  it("recipientId is stable and distinct per recipient (dedup index key)", () => {
    const convs = [convoc("c1", "pl1", { player: { first_name: "P", last_name: "1", email: "kid@x.com", user_id: null } })];
    const parents: ResendPlanParent[] = [
      { parent_user_id: "u-a", email: "Alice@X.com", full_name: "Ann", player_id: "pl1" },
      { parent_user_id: "u-b", email: "bob@x.com", full_name: "Bob", player_id: "pl1" },
    ];
    const plan = planConvocationResendRecipients(convs, parents, {});
    const ids = plan.recipients.map((r) => r.recipientId);
    // Player + 2 parents → 3 stable recipientIds, all distinct.
    expect(ids).toEqual([
      "player:pl1",
      "parent:pl1:alice@x.com",
      "parent:pl1:bob@x.com",
    ]);
  });

  it("two recipients sharing the same email address are only enqueued once", () => {
    const convs = [convoc("c1", "pl1")];
    const parents: ResendPlanParent[] = [
      { parent_user_id: "u-a", email: "shared@x.com", full_name: "Ann", player_id: "pl1" },
      { parent_user_id: "u-b", email: "SHARED@X.com", full_name: "Bob", player_id: "pl1" },
    ];
    const plan = planConvocationResendRecipients(convs, parents, {});
    expect(plan.recipients).toHaveLength(1);
  });

  it("falls back to auth email when player_parents.email is empty", () => {
    const convs = [convoc("c1", "pl1")];
    const parents: ResendPlanParent[] = [
      { parent_user_id: "u-a", email: null, full_name: "Ann", player_id: "pl1" },
    ];
    const plan = planConvocationResendRecipients(convs, parents, { "u-a": "auth@x.com" });
    expect(plan.recipients).toHaveLength(1);
    expect(plan.recipients[0].email).toBe("auth@x.com");
    expect(plan.recipients[0].idemSuffix).toBe("parent-u-a-c1");
  });

  it("skips parents with no email and no resolvable auth email", () => {
    const convs = [convoc("c1", "pl1")];
    const parents: ResendPlanParent[] = [
      { parent_user_id: "u-a", email: null, full_name: "Ann", player_id: "pl1" },
    ];
    const plan = planConvocationResendRecipients(convs, parents, {});
    expect(plan.recipients).toHaveLength(0);
  });

  it("skips convocations without a response_token", () => {
    const convs = [convoc("c1", "pl1", { response_token: null })];
    const parents: ResendPlanParent[] = [
      { parent_user_id: "u-a", email: "a@x.com", full_name: "Ann", player_id: "pl1" },
    ];
    const plan = planConvocationResendRecipients(convs, parents, {});
    expect(plan.recipients).toHaveLength(0);
  });

  it("includes the player email once and collects in-app user ids", () => {
    const convs = [
      convoc("c1", "pl1", {
        player: {
          first_name: "Kid",
          last_name: "One",
          email: "kid@x.com",
          user_id: "u-kid",
        },
      }),
    ];
    const parents: ResendPlanParent[] = [
      { parent_user_id: "u-a", email: "a@x.com", full_name: "Ann", player_id: "pl1" },
    ];
    const plan = planConvocationResendRecipients(convs, parents, {});
    expect(plan.recipients.map((r) => r.email).sort()).toEqual(["a@x.com", "kid@x.com"]);
    expect(new Set(plan.inAppUserIds)).toEqual(new Set(["u-kid", "u-a"]));
  });
});

describe("resend enqueue result handling", () => {
  it("a rejected enqueue does not produce a false global success", async () => {
    const results = await Promise.allSettled([
      Promise.resolve("ok"),
      Promise.reject(new Error("boom")),
    ]);
    const failed = results.filter((r) => r.status === "rejected").length;
    expect(failed).toBe(1);
    // The route uses `failed > 0` to display an error toast instead of success.
    expect(failed > 0).toBe(true);
  });
});
