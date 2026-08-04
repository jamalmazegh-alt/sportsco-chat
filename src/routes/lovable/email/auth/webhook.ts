import * as React from "react";
import { render } from "@react-email/components";
import { parseEmailWebhookPayload } from "@lovable.dev/email-js";
import { WebhookError, verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";
import { pickLocale, type Locale } from "@/lib/email-templates/_layout";

/** Localized subjects (at least fr+en). Falls back to fr, then "Notification". */
const EMAIL_SUBJECTS: Record<string, Partial<Record<Locale, string>> & { fr: string; en: string }> =
  {
    signup: {
      fr: "Confirmez votre adresse e-mail Clubero",
      en: "Confirm your Clubero email",
    },
    invite: {
      fr: "Vous êtes invité sur Clubero",
      en: "You're invited to Clubero",
    },
    magiclink: {
      fr: "Votre lien de connexion Clubero",
      en: "Your Clubero login link",
    },
    recovery: {
      fr: "Réinitialisez votre mot de passe Clubero",
      en: "Reset your Clubero password",
    },
    email_change: {
      fr: "Confirmez votre changement d’e-mail Clubero",
      en: "Confirm your Clubero email change",
    },
    reauthentication: {
      fr: "Votre code de vérification Clubero",
      en: "Your Clubero verification code",
    },
  };

function subjectFor(emailType: string, locale: Locale): string {
  const map = EMAIL_SUBJECTS[emailType];
  if (!map) return "Notification";
  return map[locale] ?? map.en ?? map.fr;
}

/**
 * Resolve recipient locale for auth emails.
 * Order: user_metadata.preferred_language → preferred_language → locale → Accept-Language → fr.
 */
function resolveAuthLocale(payload: { data?: Record<string, unknown> }, request: Request): Locale {
  const data = payload?.data ?? {};
  const meta =
    data.user_metadata && typeof data.user_metadata === "object"
      ? (data.user_metadata as Record<string, unknown>)
      : {};
  const accept = request.headers.get("accept-language") ?? "";
  const acceptPrimary = accept.split(",")[0]?.trim().split(";")[0]?.trim();

  const candidates: Array<unknown> = [
    meta.preferred_language,
    data.preferred_language,
    data.locale,
    acceptPrimary,
  ];

  for (const c of candidates) {
    if (c == null || c === "") continue;
    const v = String(c).toLowerCase().slice(0, 2);
    // pickLocale returns "fr" for unsupported codes; only accept when input matches a supported locale.
    if (v && pickLocale(v) === v) return v as Locale;
  }
  return "fr";
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
};

// Configuration
const SITE_NAME = "Clubero";
const SENDER_DOMAIN = "notify.clubero.app";
const ROOT_DOMAIN = "clubero.app";
const FROM_DOMAIN = "clubero.app";

function redactEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart[0]}***@${domain}`;
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;

        if (!apiKey) {
          console.error("LOVABLE_API_KEY not configured");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Verify signature + timestamp, then parse payload.
        let payload: any;
        let run_id = "";
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret: apiKey,
            parser: parseEmailWebhookPayload,
          });
          payload = verified.payload;
          run_id = payload.run_id;
        } catch (error) {
          if (error instanceof WebhookError) {
            switch (error.code) {
              case "invalid_signature":
              case "missing_timestamp":
              case "invalid_timestamp":
              case "stale_timestamp":
                console.error("Invalid webhook signature", { error: error.message });
                return Response.json({ error: "Invalid signature" }, { status: 401 });
              case "invalid_payload":
              case "invalid_json":
                console.error("Invalid webhook payload", { error: error.message });
                return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
            }
          }

          console.error("Webhook verification failed", { error });
          return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
        }

        if (!run_id) {
          console.error("Webhook payload missing run_id");
          return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
        }

        if (payload.version !== "1") {
          console.error("Unsupported payload version", { version: payload.version, run_id });
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 },
          );
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const emailType = payload.data.action_type;
        console.log("Received auth event", {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        });

        const EmailTemplate = EMAIL_TEMPLATES[emailType];
        if (!EmailTemplate) {
          console.error("Unknown email type", { emailType, run_id });
          return Response.json({ error: `Unknown email type: ${emailType}` }, { status: 400 });
        }

        const locale = resolveAuthLocale(payload, request);

        // Build template props from payload.data (HookData structure)
        // Auth templates (SignupEmail, InviteEmail, …) accept `locale?: string` via pickLocale.
        const templateProps = {
          siteName: SITE_NAME,
          siteUrl: `https://${ROOT_DOMAIN}`,
          recipient: payload.data.email,
          confirmationUrl: payload.data.url,
          token: payload.data.token,
          email: payload.data.email,
          oldEmail: payload.data.old_email,
          newEmail: payload.data.new_email,
          locale,
        };

        // Render React Email to HTML and plain text
        const element = React.createElement(EmailTemplate, templateProps);
        const html = await render(element);
        const text = await render(element, { plainText: true });

        // Enqueue email for async processing by the dispatcher (process-email-queue).
        // Use runtime SUPABASE_URL (via supabaseAdmin), not build-time VITE_* — a mismatch
        // with SUPABASE_SERVICE_ROLE_KEY silently targets the wrong project.
        const messageId = crypto.randomUUID();

        // Log pending BEFORE enqueue so we have a record even if enqueue crashes
        await supabaseAdmin.from("email_send_log").insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: payload.data.email,
          status: "pending",
        });

        const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
          queue_name: "auth_emails",
          payload: {
            run_id,
            message_id: messageId,
            to: payload.data.email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: subjectFor(emailType, locale),
            html,
            text,
            purpose: "transactional",
            label: emailType,
            queued_at: new Date().toISOString(),
          },
        });

        if (enqueueError) {
          console.error("Failed to enqueue auth email", { error: enqueueError, run_id, emailType });
          await supabaseAdmin.from("email_send_log").insert({
            message_id: messageId,
            template_name: emailType,
            recipient_email: payload.data.email,
            status: "failed",
            error_message: "Failed to enqueue email",
          });
          return Response.json({ error: "Failed to enqueue email" }, { status: 500 });
        }

        console.log("Auth email enqueued", {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          locale,
          run_id,
        });

        return Response.json({ success: true, queued: true });
      },
    },
  },
});
