import { createFileRoute } from "@tanstack/react-router";
import type { Json } from "@/integrations/supabase/types";

/**
 * Amazon SES → SNS notifications endpoint (Phase 4).
 *
 * SES publishes Bounce / Complaint / Delivery events to an SNS topic; SNS
 * delivers them here over HTTPS. We feed permanent bounces and complaints into
 * `suppressed_emails` — the same table the Lovable/Mailgun webhook writes to —
 * so the pre-send suppression check keeps working after the SES cutover.
 *
 * Auth: SES/SNS lets you choose the subscription endpoint URL, so we embed a
 * shared secret in the query string (`?key=<SES_SNS_SECRET>`). Combined with a
 * TopicArn allowlist and a host check on the SNS confirmation URL, this
 * authenticates callers without shipping RSA cert parsing to the Worker.
 * (Full SNS signature verification can be layered on later as extra hardening.)
 *
 * Required env: SES_SNS_SECRET, SUPABASE_SERVICE_ROLE_KEY
 * Optional env: SES_SNS_TOPIC_ARN (allowlist)
 */

interface SnsEnvelope {
  Type?: string;
  TopicArn?: string;
  Message?: string;
  SubscribeURL?: string;
  SigningCertURL?: string;
}

function isAwsSnsHost(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const u = new URL(rawUrl);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

const redact = (email: string): string => {
  const [l, d] = email.split("@");
  return `${(l ?? "")[0] ?? "*"}***@${d ?? "?"}`;
};

export const Route = createFileRoute("/api/public/hooks/ses-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SES_SNS_SECRET;
        if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.error("ses_notifications.missing_env");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // 1. Shared-secret auth via query string (fail closed).
        const key = new URL(request.url).searchParams.get("key");
        if (key !== secret) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let env: SnsEnvelope;
        try {
          env = JSON.parse(await request.text());
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        // 2. Topic allowlist.
        const allowedArn = process.env.SES_SNS_TOPIC_ARN;
        if (allowedArn && env.TopicArn && env.TopicArn !== allowedArn) {
          console.warn("ses_notifications.topic_mismatch", { topic: env.TopicArn });
          return Response.json({ error: "Forbidden topic" }, { status: 403 });
        }

        const type = env.Type ?? request.headers.get("x-amz-sns-message-type") ?? "";

        // 3. Subscription handshake — confirm only if the URL is a genuine SNS host.
        if (type === "SubscriptionConfirmation") {
          if (!isAwsSnsHost(env.SubscribeURL)) {
            console.warn("ses_notifications.bad_confirm_url", { url: env.SubscribeURL });
            return Response.json({ error: "Bad SubscribeURL" }, { status: 400 });
          }
          await fetch(env.SubscribeURL as string).catch((e) =>
            console.error("ses_notifications.confirm_failed", { error: String(e) }),
          );
          console.log("ses_notifications.subscription_confirmed");
          return Response.json({ ok: true, confirmed: true });
        }

        if (type !== "Notification") {
          return Response.json({ ok: true, ignored: type });
        }

        // 4. Parse the SES event and extract suppressions.
        let msg: any;
        try {
          msg = JSON.parse(env.Message ?? "{}");
        } catch {
          return Response.json({ error: "Invalid SES message" }, { status: 400 });
        }

        const notificationType: string = msg.notificationType ?? msg.eventType ?? "";
        let reason: "bounce" | "complaint" | null = null;
        let recipients: string[] = [];
        let detail: Record<string, unknown> = {};

        if (notificationType === "Bounce" && msg.bounce?.bounceType === "Permanent") {
          reason = "bounce";
          recipients = (msg.bounce.bouncedRecipients ?? [])
            .map((r: any) => r.emailAddress)
            .filter(Boolean);
          detail = {
            bounceType: msg.bounce.bounceType,
            bounceSubType: msg.bounce.bounceSubType,
            feedbackId: msg.bounce.feedbackId,
          };
        } else if (notificationType === "Complaint") {
          reason = "complaint";
          recipients = (msg.complaint.complainedRecipients ?? [])
            .map((r: any) => r.emailAddress)
            .filter(Boolean);
          detail = { feedbackId: msg.complaint.feedbackId };
        }

        // Transient bounces, deliveries, etc. are acknowledged but not suppressed.
        if (!reason || recipients.length === 0) {
          return Response.json({ ok: true, suppressed: 0, notificationType });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const providerMessageId: string | null = msg.mail?.messageId ?? null;
        let suppressed = 0;

        for (const raw of recipients) {
          const email = String(raw).toLowerCase();
          const metadata = {
            source: "ses",
            provider_message_id: providerMessageId,
            ...detail,
          } as unknown as Json;

          // Incrémente bounce_count sur bounce (tolérance de 3), bloque d'emblée sur complaint.
          const { data: existing } = await supabaseAdmin
            .from("suppressed_emails")
            .select("id, bounce_count")
            .eq("email", email)
            .maybeSingle();
          const nextBounceCount =
            reason === "bounce" ? (existing?.bounce_count ?? 0) + 1 : 3;

          const { error: supErr } = await supabaseAdmin
            .from("suppressed_emails")
            .upsert(
              {
                email,
                reason,
                metadata,
                bounce_count: nextBounceCount,
                last_bounce_at: reason === "bounce" ? new Date().toISOString() : null,
              },
              { onConflict: "email" },
            );
          if (supErr) {
            console.error("ses_notifications.suppress_failed", {
              email_redacted: redact(email),
              error: supErr,
            });
            continue;
          }

          await supabaseAdmin.from("email_send_log").insert({
            message_id: providerMessageId,
            template_name: "system",
            recipient_email: email,
            status: reason === "bounce" ? "bounced" : "complained",
            error_message:
              reason === "bounce"
                ? `SES permanent bounce (${nextBounceCount}/3) — address invalid or rejected`
                : "SES complaint — recipient marked email as spam",
            metadata,
          });
          suppressed += 1;
          console.log("ses_notifications.suppressed", {
            email_redacted: redact(email),
            reason,
            bounce_count: nextBounceCount,
          });
        }

        return Response.json({ ok: true, suppressed });
      },
    },
  },
});
