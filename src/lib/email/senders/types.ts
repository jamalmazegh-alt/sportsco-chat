/**
 * Contract for pluggable email providers.
 *
 * Introduced in Phase 1 of the multi-provider migration. Providers must be
 * pure: they take a fully-rendered payload and return a provider message id.
 * Retry, deduplication, rate-limit, DLQ, and logging all remain the
 * responsibility of the caller (currently the queue processor in
 * `src/routes/lovable/email/queue/process.ts`).
 */
export type ProviderName = "lovable" | "ses" | "brevo";

export interface SendPayload {
  /** Recipient (single address — batching is a caller concern, not provider). */
  to: string;
  /** From header (e.g. "Clubero <no-reply@notify.clubero.app>" or bare address). */
  from: string;
  /** Verified sender subdomain FQDN. Some providers require it explicitly. */
  senderDomain: string;
  subject: string;
  html: string;
  text: string;
  /** Purpose tag propagated for analytics (e.g. "transactional", "auth_signup"). */
  purpose?: string;
  /** Free-form label propagated to the provider for filtering/observability. */
  label?: string;
  /** Business-level idempotency key (dispatch/recipient/notification_type). */
  idempotencyKey?: string;
  /** Our own message id (stable across retries of a single queued message). */
  messageId?: string;
  /** Unsubscribe token for the List-Unsubscribe headers. */
  unsubscribeToken?: string;
  /** Lovable-specific run id — passed through only when the provider needs it. */
  runId?: string;
}

export interface SendResult {
  /** Identifier returned by the provider (used for downstream tracing). */
  providerMessageId: string;
}

export interface EmailSender {
  readonly name: ProviderName;
  send(payload: SendPayload): Promise<SendResult>;
}
