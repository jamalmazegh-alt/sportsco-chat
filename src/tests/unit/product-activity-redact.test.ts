import { describe, it, expect } from "vitest";
import { redactErrorMessage } from "@/lib/observability/redact";

describe("redactErrorMessage", () => {
  it("masks access_token in URL-encoded params", () => {
    const out = redactErrorMessage(
      "failed https://graph.facebook.com/v18.0/me?access_token=EAABsecretXYZ&fields=id",
    );
    expect(out).not.toContain("EAABsecretXYZ");
    expect(out).toContain("access_token=[REDACTED]");
  });

  it("masks client_secret and refresh_token", () => {
    const out = redactErrorMessage("client_secret=abcdef refresh_token=zzz.yyy.xxx more");
    expect(out).not.toContain("abcdef");
    expect(out).not.toContain("zzz.yyy.xxx");
    expect(out).toContain("client_secret=[REDACTED]");
    expect(out).toContain("refresh_token=[REDACTED]");
  });

  it("masks Bearer tokens", () => {
    const out = redactErrorMessage("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig");
    expect(out).toContain("Bearer [REDACTED]");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("masks email addresses", () => {
    const out = redactErrorMessage("row 4: john.doe+tag@example.co.uk invalid");
    expect(out).toContain("[EMAIL]");
    expect(out).not.toContain("john.doe+tag@example.co.uk");
  });

  it("truncates long payloads", () => {
    const out = redactErrorMessage("x".repeat(2000));
    expect(out.length).toBeLessThanOrEqual(501);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles Error instances and null", () => {
    expect(redactErrorMessage(new Error("boom access_token=secret"))).toContain(
      "access_token=[REDACTED]",
    );
    expect(redactErrorMessage(null)).toBe("");
    expect(redactErrorMessage(undefined)).toBe("");
  });

  it("stringifies objects and masks inside", () => {
    const out = redactErrorMessage({ error: "bad", url: "https://x/y?access_token=zzz" });
    expect(out).toContain("access_token=[REDACTED]");
  });
});
