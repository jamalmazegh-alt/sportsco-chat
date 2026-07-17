import { sendLovableEmail } from "@lovable.dev/email-js";
import type { EmailSender, SendPayload, SendResult } from "./types";

/**
 * Adapter around `@lovable.dev/email-js` that matches the `EmailSender`
 * contract. This is a pure extraction — no behavior change relative to the
 * previous inline call site in the queue processor.
 *
 * Errors (rate limit, recipient_mismatch, transport failures) are re-thrown
 * verbatim. Callers classify them via `queue-error-classify`.
 */
export class LovableSender implements EmailSender {
  readonly name = "lovable" as const;

  async send(payload: SendPayload): Promise<SendResult> {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await sendLovableEmail(
      {
        run_id: payload.runId,
        to: payload.to,
        from: payload.from,
        sender_domain: payload.senderDomain,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        purpose: payload.purpose,
        label: payload.label,
        idempotency_key: payload.idempotencyKey,
        unsubscribe_token: payload.unsubscribeToken,
        message_id: payload.messageId,
      },
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    );

    // Prefer the provider-returned id; fall back to our business message_id
    // so the log column is never empty on successful sends.
    return {
      providerMessageId: response.message_id ?? payload.messageId ?? "",
    };
  }
}
