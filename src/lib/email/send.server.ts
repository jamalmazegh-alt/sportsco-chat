import * as React from "react";
import { render } from "@react-email/components";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "Clubero";
const SENDER_DOMAIN = "notify.clubero.app";
const FROM_DOMAIN = "clubero.app";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface EnqueueTransactionalEmailServerParams {
  templateName: string;
  recipientEmail?: string;
  templateData?: Record<string, any>;
  idempotencyKey?: string;
  fromName?: string;
  // Anti-doublon / traçabilité métier — propagés dans le payload pgmq et
  // dans email_send_log pour permettre la déduplication par
  // (dispatch_id, recipient_id, notification_type).
  dispatchId?: string;
  eventId?: string;
  recipientId?: string;
  notificationType?: string;
}

/**
 * Enqueue a transactional email from a server context that has no user JWT
 * (webhooks, cron, server functions). Uses supabaseAdmin directly.
 */
export async function enqueueTransactionalEmailServer(
  params: EnqueueTransactionalEmailServerParams,
) {
  const template = TEMPLATES[params.templateName];
  if (!template) throw new Error(`Template '${params.templateName}' not found`);

  const recipient = template.to || params.recipientEmail;
  if (!recipient) throw new Error("recipientEmail required");
  const normalized = recipient.toLowerCase();
  const messageId = crypto.randomUUID();
  const idempotencyKey = params.idempotencyKey || messageId;

  const runStep = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error("enqueueTransactionalEmailServer step failed", {
        step: name,
        templateName: params.templateName,
        recipient_redacted: recipient.replace(/^(.).*(@.*)$/, "$1***$2"),
        error: err.message,
        stack: err.stack,
      });
      throw err;
    }
  };

  const baseMeta = {
    dispatch_id: params.dispatchId ?? null,
    event_id: params.eventId ?? null,
    recipient_id: params.recipientId ?? null,
    notification_type: params.notificationType ?? null,
  };

  // Suppression check — les bounces sont tolérés jusqu'à 3 tentatives ;
  // les plaintes spam et désinscriptions bloquent immédiatement.
  const { data: suppressed } = await runStep("suppression_check", async () =>
    supabaseAdmin
      .from("suppressed_emails")
      .select("id, reason, bounce_count")
      .eq("email", normalized)
      .maybeSingle(),
  );
  const isBlocked =
    !!suppressed &&
    (suppressed.reason !== "bounce" || (suppressed.bounce_count ?? 1) >= 3);
  if (isBlocked) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: recipient,
      status: "suppressed",
      ...baseMeta,
    });
    return { success: false, reason: "suppressed" as const, messageId };
  }

  // Idempotence côté serveur : si un envoi 'sent'/'delivered' existe déjà pour
  // cette clé métier, on ne renqueue pas. L'index unique en base est la
  // vraie ceinture, ce test est la bretelle qui évite d'enfiler inutilement.
  if (params.dispatchId && params.recipientId && params.notificationType) {
    const { data: already } = await supabaseAdmin
      .from("email_send_log")
      .select("id")
      .eq("dispatch_id", params.dispatchId)
      .eq("recipient_id", params.recipientId)
      .eq("notification_type", params.notificationType)
      .in("status", ["sent", "delivered"])
      .maybeSingle();
    if (already) {
      return { success: false, reason: "already_delivered" as const, messageId };
    }
  }

  // Unsubscribe token (one per email)
  let unsubscribeToken: string;
  const { data: existing } = await runStep("unsubscribe_lookup", async () =>
    supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token, used_at")
      .eq("email", normalized)
      .maybeSingle(),
  );
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token;
  } else {
    unsubscribeToken = generateToken();
    await runStep("unsubscribe_upsert", async () =>
      supabaseAdmin
        .from("email_unsubscribe_tokens")
        .upsert(
          { token: unsubscribeToken, email: normalized },
          { onConflict: "email", ignoreDuplicates: true },
        ),
    );
    const { data: stored } = await runStep("unsubscribe_refetch", async () =>
      supabaseAdmin
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", normalized)
        .maybeSingle(),
    );
    if (stored?.token) unsubscribeToken = stored.token;
  }

  const data = params.templateData ?? {};
  const element = React.createElement(template.component, data);
  const html = await runStep("render_html", async () => render(element));
  const text = await runStep("render_text", async () => render(element, { plainText: true }));
  const subject =
    typeof template.subject === "function" ? template.subject(data) : template.subject;

  await runStep("log_pending", async () =>
    supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: recipient,
      status: "pending",
      ...baseMeta,
    }),
  );

  const { error } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${params.fromName || SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: params.templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
      // Métadonnées de dispatch propagées au processeur pour qu'il puisse
      // enregistrer chaque tentative avec ces clés.
      dispatch_id: params.dispatchId,
      event_id: params.eventId,
      recipient_id: params.recipientId,
      notification_type: params.notificationType,
    },
  });

  if (error) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: params.templateName,
      recipient_email: recipient,
      status: "failed",
      error_message: `enqueue_email failed: ${error.message}`,
      ...baseMeta,
    });
    throw error;
  }
  return { success: true, messageId };
}
