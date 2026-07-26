import { describe, it, expect } from "vitest";
import {
  isAuthEmailUnconfirmed,
  resolveParentAccountBadge,
} from "@/lib/players/parent-account-status";

describe("isAuthEmailUnconfirmed", () => {
  it("retourne false si l'utilisateur est absent", () => {
    expect(isAuthEmailUnconfirmed(null)).toBe(false);
    expect(isAuthEmailUnconfirmed(undefined)).toBe(false);
  });

  it("retourne true si email_confirmed_at est null/absent", () => {
    expect(isAuthEmailUnconfirmed({ email_confirmed_at: null })).toBe(true);
    expect(isAuthEmailUnconfirmed({})).toBe(true);
  });

  it("retourne false si l'e-mail est confirmé", () => {
    expect(isAuthEmailUnconfirmed({ email_confirmed_at: "2026-07-01T00:00:00Z" })).toBe(false);
  });
});

describe("resolveParentAccountBadge", () => {
  const unconfirmed = new Set(["parent-unconfirmed"]);

  it("inactive quand aucun parent_user_id", () => {
    expect(resolveParentAccountBadge({ parentUserId: null, unconfirmedUserIds: unconfirmed })).toBe(
      "inactive",
    );
    expect(
      resolveParentAccountBadge({ parentUserId: undefined, unconfirmedUserIds: unconfirmed }),
    ).toBe("inactive");
  });

  it("unconfirmed quand le parent lié n'a pas confirmé son e-mail", () => {
    expect(
      resolveParentAccountBadge({
        parentUserId: "parent-unconfirmed",
        unconfirmedUserIds: unconfirmed,
      }),
    ).toBe("unconfirmed");
  });

  it("active quand le parent lié a confirmé son e-mail", () => {
    expect(
      resolveParentAccountBadge({
        parentUserId: "parent-ok",
        unconfirmedUserIds: unconfirmed,
      }),
    ).toBe("active");
  });
});
