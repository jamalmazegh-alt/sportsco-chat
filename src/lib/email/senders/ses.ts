import { AwsClient } from "aws4fetch";
import type { EmailSender, SendPayload, SendResult } from "./types";

/**
 * Amazon SES sender (Phase 4).
 *
 * Sends via the SES v2 HTTP API (`SendEmail`) signed with SigV4 through
 * `aws4fetch` — deliberately NOT the `@aws-sdk/*` packages, which are too heavy
 * for the Cloudflare Worker bundle. We send raw MIME so we keep full control of
 * headers (notably `List-Unsubscribe` / `List-Unsubscribe-Post`, required by
 * Gmail/Yahoo bulk policies) and UTF-8 subjects (French accents).
 *
 * Retry, deduplication (the message_id "sent" guard), DLQ, rate-limit backoff
 * and logging all remain the caller's job (the queue processor) — this adapter
 * is pure send. Errors are thrown with a `.status` property and a
 * "<status>"-bearing message so `queue-error-classify` treats SES 429s as
 * rate limits exactly like the Lovable path.
 *
 * NOTE: `recipient_mismatch` cannot occur on SES — there is no "run" concept.
 * The `runId` field of SendPayload is Lovable-specific and ignored here.
 *
 * Required env:
 *   AWS_SES_REGION            (default "eu-west-1")
 *   AWS_SES_ACCESS_KEY_ID
 *   AWS_SES_SECRET_ACCESS_KEY
 * Optional env:
 *   AWS_SES_CONFIGURATION_SET (to publish bounce/complaint events to SNS)
 *   SITE_URL                  (base for the List-Unsubscribe link)
 */

class SesApiError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(`SES API error: ${status} ${body}`.slice(0, 500));
    this.name = "SesApiError";
    this.status = status;
  }
}

// UTF-8 safe base64 (btoa is latin1-only; chunk to avoid call-stack blowups).
function base64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
const b64utf8 = (s: string): string => base64(new TextEncoder().encode(s));

// RFC 2047 encoded-word so accented subjects survive.
const encodeSubject = (s: string): string => `=?UTF-8?B?${b64utf8(s)}?=`;

// Format a `Display Name <addr>` string for the MIME From header so the display
// name (e.g. "USAG Uckange via Clubero") is preserved: quote it (ASCII) or
// RFC-2047 encode it (accented club names). A bare address is returned as-is.
export function formatFromHeader(from: string): string {
  const m = from.match(/^\s*(.*?)\s*<\s*([^<>@\s]+@[^<>@\s]+)\s*>\s*$/);
  if (!m || !m[1]) return from;
  const name = m[1];
  const addr = m[2];
  // Non-ASCII display names need RFC-2047; avoid control-char regex (eslint).
  const needsRfc2047 = [...name].some((c) => c.charCodeAt(0) > 127);
  const display = needsRfc2047
    ? `=?UTF-8?B?${b64utf8(name)}?=`
    : `"${name.replace(/([\\"])/g, "\\$1")}"`;
  return `${display} <${addr}>`;
}

// Wrap base64 body at 76 chars per RFC 2045.
const wrap76 = (s: string): string => s.replace(/(.{76})/g, "$1\r\n");

/**
 * Rewrite the domain of a From address to the SES-verified sending domain,
 * preserving the display name and local part. SES only accepts a From whose
 * domain is a verified identity (here: send.clubero.app). The enqueue-time
 * constants still target the Lovable domain (notify.clubero.app) for the
 * Lovable path, so the swap must happen per-provider, at send time — this keeps
 * rollback to EMAIL_PROVIDER=lovable a pure flag flip with no domain changes.
 *   "Clubero <noreply@clubero.app>" -> "Clubero <noreply@send.clubero.app>"
 * No-op when AWS_SES_FROM_DOMAIN is unset (address passes through unchanged).
 */
export function rewriteFromDomain(from: string, domain: string | undefined): string {
  if (!domain) return from;
  const m = from.match(/^(.*<)?\s*([^<>@\s]+)@([^<>@\s]+?)\s*(>)?$/);
  if (!m) return from;
  return `${m[1] ?? ""}${m[2]}@${domain}${m[4] ?? ""}`;
}

function buildMime(p: SendPayload, from: string): string {
  const boundary =
    "clubero_" + (p.messageId ?? "m").replace(/[^A-Za-z0-9]/g, "").slice(0, 40) + "_alt";
  const headers: string[] = [
    `From: ${formatFromHeader(from)}`,
    `To: ${p.to}`,
    `Subject: ${encodeSubject(p.subject)}`,
    "MIME-Version: 1.0",
  ];
  const siteUrl = process.env.SITE_URL;
  if (p.unsubscribeToken && siteUrl) {
    const url = `${siteUrl.replace(/\/$/, "")}/email/unsubscribe?token=${encodeURIComponent(
      p.unsubscribeToken,
    )}`;
    headers.push(`List-Unsubscribe: <${url}>`);
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const body: string[] = [
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64utf8(p.text ?? "")),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64utf8(p.html ?? "")),
    `--${boundary}--`,
    "",
  ];
  return headers.join("\r\n") + "\r\n" + body.join("\r\n");
}

export class SesSender implements EmailSender {
  readonly name = "ses" as const;

  async send(payload: SendPayload): Promise<SendResult> {
    const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
    const region = process.env.AWS_SES_REGION ?? "eu-west-1";
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY are not configured");
    }

    // SES v2 SigV4 signing name is "ses" even though the host is email.*.
    const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "ses" });

    // Force the From onto the SES-verified domain (send.clubero.app). The
    // enqueue-time From still targets the Lovable domain; only the SES path
    // rewrites, so Lovable stays a working fallback under EMAIL_PROVIDER=lovable.
    const from = rewriteFromDomain(payload.from, process.env.AWS_SES_FROM_DOMAIN);

    // Do NOT set FromEmailAddress: when combined with Raw content, SES normalizes
    // the From and drops the display name (club name). Leaving it out makes the
    // raw MIME From header authoritative, so "USAG Uckange via Clubero" survives.
    const requestBody: Record<string, unknown> = {
      Destination: { ToAddresses: [payload.to] },
      Content: { Raw: { Data: b64utf8(buildMime(payload, from)) } },
    };
    const configSet = process.env.AWS_SES_CONFIGURATION_SET;
    if (configSet) requestBody.ConfigurationSetName = configSet;

    const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
    const res = await aws.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // 400 with a Throttling type is SES' rate-limit signal; surface it as 429
      // so the caller's isRateLimited() backs the whole queue off.
      const throttled = res.status === 429 || /throttl|TooManyRequests|rate exceeded/i.test(text);
      throw new SesApiError(throttled ? 429 : res.status, text);
    }

    const json = (await res.json().catch(() => ({}))) as { MessageId?: string };
    return { providerMessageId: json.MessageId ?? payload.messageId ?? "" };
  }
}
