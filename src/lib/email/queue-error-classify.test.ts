import { describe, it, expect } from "vitest";
import {
  getRetryAfterSeconds,
  isForbidden,
  isRateLimited,
  isTransientRunRecipientMismatch,
} from "@/lib/email/queue-error-classify";

// Mimic the SDK's EmailAPIError: a structured error carrying `status` and a
// message of the form `Email API error: <status> <body>`.
class FakeEmailAPIError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(status: number, body: string, retryAfterSeconds: number | null = null) {
    super(`Email API error: ${status} ${body}`);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const recipientMismatch = new FakeEmailAPIError(
  403,
  '{"error":"recipient_mismatch","message":"Recipient does not match run"}',
);

describe("email queue error classification", () => {
  it("flags rate limits (429) via status and via message fallback", () => {
    expect(isRateLimited(new FakeEmailAPIError(429, "Too Many Requests"))).toBe(true);
    expect(isRateLimited(new Error("Email API error: 429 slow down"))).toBe(true);
    expect(isRateLimited(recipientMismatch)).toBe(false);
  });

  it("flags 403 responses via status and via message fallback", () => {
    expect(isForbidden(new FakeEmailAPIError(403, "Forbidden"))).toBe(true);
    expect(isForbidden(new Error("Email API error: 403 nope"))).toBe(true);
    expect(isForbidden(new FakeEmailAPIError(500, "boom"))).toBe(false);
  });

  it("recognises recipient_mismatch as transient (by error slug and by prose)", () => {
    expect(isTransientRunRecipientMismatch(recipientMismatch)).toBe(true);
    expect(isTransientRunRecipientMismatch(new Error("403 Recipient does not match run"))).toBe(
      true,
    );
    expect(
      isTransientRunRecipientMismatch(new FakeEmailAPIError(403, "sender_domain_unverified")),
    ).toBe(false);
  });

  // Regression guard for fix (a): recipient_mismatch is a 403, but the dispatcher must
  // RETRY it (leave in queue), not DLQ it. Routing rule in process.ts is
  // `isForbidden(e) && !isTransientRunRecipientMismatch(e)` → DLQ.
  it("routes recipient_mismatch to RETRY, not to the DLQ", () => {
    const goesToDlq = (e: unknown) => isForbidden(e) && !isTransientRunRecipientMismatch(e);
    expect(goesToDlq(recipientMismatch)).toBe(false);
    expect(goesToDlq(new FakeEmailAPIError(403, "domain not verified"))).toBe(true);
    expect(goesToDlq(new FakeEmailAPIError(500, "server error"))).toBe(false);
  });

  it("reads Retry-After seconds, defaulting to 60s", () => {
    expect(getRetryAfterSeconds(new FakeEmailAPIError(429, "x", 120))).toBe(120);
    expect(getRetryAfterSeconds(new FakeEmailAPIError(429, "x", null))).toBe(60);
    expect(getRetryAfterSeconds(new Error("no structured fields"))).toBe(60);
  });
});
