import { LovableSender } from "./lovable";
import { SesSender } from "./ses";
import type { EmailSender, ProviderName } from "./types";

export type { EmailSender, ProviderName, SendPayload, SendResult } from "./types";
export { LovableSender } from "./lovable";
export { SesSender } from "./ses";

/**
 * Resolve the active email sender from the `EMAIL_PROVIDER` env var.
 *
 * Read at each call — never cached — so the flag can be flipped without
 * redeploying the Worker once we reach Phase 4. Unknown values fall back
 * to `lovable` (the current default) to avoid dropping mail on a typo.
 */
export function getEmailSender(): EmailSender {
  const raw = (process.env.EMAIL_PROVIDER ?? "lovable").toLowerCase() as ProviderName;
  switch (raw) {
    case "ses":
      return new SesSender();
    case "lovable":
    default:
      return new LovableSender();
  }
}
