import { describe, it, expect } from "vitest";
import {
  inviteMatchesEmail,
  resolveSignupPath,
  isEmailAlreadyExistsError,
  normalizeEmail,
  type MemberInviteInfo,
} from "@/lib/invite-signup";

const member = (o: Partial<NonNullable<MemberInviteInfo>> = {}): MemberInviteInfo => ({
  used: false,
  expired: false,
  email: "parent@example.com",
  kind: "parent",
  ...o,
});

describe("inviteMatchesEmail (token ↔ email security gate)", () => {
  it("accepts a valid invite bound to the exact email (case/space insensitive)", () => {
    expect(inviteMatchesEmail(member(), "  Parent@Example.com ")).toBe(true);
  });

  it("refuses when the token is bound to another email", () => {
    expect(inviteMatchesEmail(member(), "attacker@evil.com")).toBe(false);
  });

  it("refuses unknown, used or expired tokens", () => {
    expect(inviteMatchesEmail(null, "parent@example.com")).toBe(false);
    expect(inviteMatchesEmail(member({ used: true }), "parent@example.com")).toBe(false);
    expect(inviteMatchesEmail(member({ expired: true }), "parent@example.com")).toBe(false);
  });

  it("refuses invites without a bound email (link-style)", () => {
    expect(inviteMatchesEmail(member({ email: null }), "parent@example.com")).toBe(false);
  });
});

describe("resolveSignupPath", () => {
  it("nominative member invites are created server-side (no verification email)", () => {
    expect(resolveSignupPath("member")).toBe("server_create");
  });

  it("club link invites keep the standard client signUp + email confirmation", () => {
    expect(resolveSignupPath("club")).toBe("client_signup");
  });

  it("plain signups keep the standard flow", () => {
    expect(resolveSignupPath(null)).toBe("client_signup");
  });
});

describe("isEmailAlreadyExistsError", () => {
  it("detects existing-account errors so we sign in instead of recreating", () => {
    expect(isEmailAlreadyExistsError("A user with this email address has already been registered")).toBe(
      true,
    );
    expect(isEmailAlreadyExistsError("email exists")).toBe(true);
    expect(isEmailAlreadyExistsError("user_already_exists")).toBe(true);
  });

  it("does not swallow unrelated errors", () => {
    expect(isEmailAlreadyExistsError("weak password")).toBe(false);
    expect(isEmailAlreadyExistsError(null)).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail(" A@B.COM ")).toBe("a@b.com");
  });
});
