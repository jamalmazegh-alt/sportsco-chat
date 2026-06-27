import { describe, expect, it } from "vitest";
import { hasPaidAccessFromSubscription, isBillingExempt } from "@/lib/has-paid-access";

const NOW = new Date("2026-06-22T12:00:00Z").getTime();

describe("hasPaidAccessFromSubscription", () => {
  it("returns true when exempt_from_billing is true (canceled status)", () => {
    expect(
      hasPaidAccessFromSubscription({ status: "canceled", exempt_from_billing: true }, NOW),
    ).toBe(true);
  });

  it("returns true when exempt_from_billing is true (past_due status)", () => {
    expect(
      hasPaidAccessFromSubscription(
        {
          status: "past_due",
          current_period_end: "2020-01-01T00:00:00Z",
          exempt_from_billing: true,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("returns false when not exempt and canceled", () => {
    expect(
      hasPaidAccessFromSubscription({ status: "canceled", exempt_from_billing: false }, NOW),
    ).toBe(false);
  });

  it("returns true for active subscription in period", () => {
    expect(
      hasPaidAccessFromSubscription(
        {
          status: "active",
          current_period_end: "2027-01-01T00:00:00Z",
          exempt_from_billing: false,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("returns true for valid trialing", () => {
    expect(
      hasPaidAccessFromSubscription(
        {
          status: "trialing",
          trial_end: "2027-01-01T00:00:00Z",
          exempt_from_billing: false,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("returns false for expired trial without exemption", () => {
    expect(
      hasPaidAccessFromSubscription(
        {
          status: "trialing",
          trial_end: "2020-01-01T00:00:00Z",
          exempt_from_billing: false,
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("isBillingExempt", () => {
  it("detects exemption flag", () => {
    expect(isBillingExempt({ status: "canceled", exempt_from_billing: true })).toBe(true);
    expect(isBillingExempt({ status: "active", exempt_from_billing: false })).toBe(false);
  });
});
