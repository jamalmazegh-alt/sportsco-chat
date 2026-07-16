// Pure classifiers for email-provider send errors, extracted from the queue
// dispatcher so the retry/DLQ routing can be unit-tested in isolation.
//
// The provider SDK throws `EmailAPIError` with a numeric `status`; older/wrapped
// errors only carry a message string, so every predicate also falls back to
// parsing the message.

// A rate-limit (429) response: back off and retry later.
export function isRateLimited(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 429;
  }
  return error instanceof Error && error.message.includes("429");
}

// A forbidden (403) response. Normally permanent (misconfiguration / authorization),
// so the dispatcher moves it straight to the DLQ — UNLESS it is a transient
// recipient_mismatch (see below).
export function isForbidden(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 403;
  }
  return error instanceof Error && error.message.includes("403");
}

// A `403 recipient_mismatch` ("Recipient does not match run") is NOT a permanent
// failure, even though it is a 403. It happens when several transactional emails
// are sent in the same burst (same API key, same short time window): the provider
// groups them into a single auto-created transactional run, binds that run to the
// FIRST recipient, then rejects the siblings whose recipient differs. The collision
// is transient — a retry on a later cycle lands outside the burst window and
// succeeds. These must be retried, not dropped to the DLQ.
export function isTransientRunRecipientMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /recipient_mismatch|does not match run/i.test(message);
}

// Extract Retry-After seconds from a structured EmailAPIError, or default to 60s.
export function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === "object" && "retryAfterSeconds" in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60;
  }
  return 60;
}
