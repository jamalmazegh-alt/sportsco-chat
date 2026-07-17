import type { EmailSender, SendPayload, SendResult } from "./types";

/**
 * Placeholder implementation for Amazon SES.
 *
 * Phase 1 goal: freeze the contract without shipping the AWS SDK to the
 * Worker bundle. The real implementation lands in Phase 4 once the SES
 * account is out of sandbox and DNS is authenticated (Phase 2).
 *
 * Deliberately throws if invoked so a misconfigured `EMAIL_PROVIDER=ses`
 * fails fast instead of silently dropping emails.
 */
export class SesSender implements EmailSender {
  readonly name = "ses" as const;

  async send(_payload: SendPayload): Promise<SendResult> {
    throw new Error(
      "SES sender not yet configured — set EMAIL_PROVIDER=lovable or complete Phase 2/4 setup",
    );
  }
}
