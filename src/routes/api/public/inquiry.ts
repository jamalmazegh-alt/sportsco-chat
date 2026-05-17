import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { render } from "@react-email/components";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "Clubero";
const SENDER_DOMAIN = "notify.clubero.app";
const FROM_DOMAIN = "clubero.app";
const ADMIN_TEMPLATE = "inbound-inquiry";
const CONFIRM_TEMPLATE = "inquiry-confirmation";

const InquirySchema = z.object({
  kind: z.enum(["contact", "demo"]),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().default(""),
  club: z.string().trim().max(160).optional().default(""),
  role: z.string().trim().max(120).optional().default(""),
  teams: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(4000).optional().default(""),
  notes: z.string().trim().max(4000).optional().default(""),
});

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateUnsubscribeToken(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<string> {
  const normalized = email.toLowerCase();
  const { data: existing } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalized)
    .maybeSingle();
  if (existing && !existing.used_at) return existing.token as string;
  const token = generateToken();
  await supabase
    .from("email_unsubscribe_tokens")
    .upsert({ token, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
  const { data: stored } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  return (stored?.token as string) || token;
}

export const Route = createFileRoute("/api/public/inquiry")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }

        let parsed;
        try {
          parsed = InquirySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid input" }, { status: 400 });
        }

        const adminTemplate = TEMPLATES[ADMIN_TEMPLATE];
        const confirmTemplate = TEMPLATES[CONFIRM_TEMPLATE];
        if (!adminTemplate?.to || !confirmTemplate) {
          return Response.json({ error: "Template missing" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        const safeName = parsed.name.replace(/[\r\n<>"]/g, "").slice(0, 80);
        const safeEmail = parsed.email.replace(/[\r\n<>"]/g, "");
        const replyTo = `${safeName} <${safeEmail}>`;

        // 1) Admin notification to hello@clubero.app
        try {
          const adminId = crypto.randomUUID();
          const adminEl = React.createElement(adminTemplate.component, parsed);
          const adminHtml = await render(adminEl);
          const adminText = await render(adminEl, { plainText: true });
          const adminSubject =
            typeof adminTemplate.subject === "function"
              ? adminTemplate.subject(parsed)
              : adminTemplate.subject;
          const adminToken = await getOrCreateUnsubscribeToken(supabase, adminTemplate.to);

          await supabase.from("email_send_log").insert({
            message_id: adminId,
            template_name: ADMIN_TEMPLATE,
            recipient_email: adminTemplate.to,
            status: "pending",
          });

          const { error: adminErr } = await supabase.rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              message_id: adminId,
              to: adminTemplate.to,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              reply_to: replyTo,
              sender_domain: SENDER_DOMAIN,
              subject: adminSubject,
              html: adminHtml,
              text: adminText,
              purpose: "transactional",
              label: ADMIN_TEMPLATE,
              idempotency_key: adminId,
              unsubscribe_token: adminToken,
              queued_at: new Date().toISOString(),
            },
          });
          if (adminErr) {
            await supabase.from("email_send_log").insert({
              message_id: adminId,
              template_name: ADMIN_TEMPLATE,
              recipient_email: adminTemplate.to,
              status: "failed",
              error_message: `enqueue_email failed: ${adminErr.message}`,
            });
            console.error("Failed to enqueue admin inquiry email", adminErr);
            return Response.json({ error: "Failed to send" }, { status: 500 });
          }
        } catch (err) {
          console.error("Admin email error", err);
          return Response.json({ error: "Failed to send" }, { status: 500 });
        }

        // 2) Confirmation email to the user (best-effort)
        try {
          const confirmId = crypto.randomUUID();
          const confirmData = { kind: parsed.kind, name: parsed.name };
          const confirmEl = React.createElement(confirmTemplate.component, confirmData);
          const confirmHtml = await render(confirmEl);
          const confirmText = await render(confirmEl, { plainText: true });
          const confirmSubject =
            typeof confirmTemplate.subject === "function"
              ? confirmTemplate.subject(confirmData)
              : confirmTemplate.subject;
          const userToken = await getOrCreateUnsubscribeToken(supabase, parsed.email);

          await supabase.from("email_send_log").insert({
            message_id: confirmId,
            template_name: CONFIRM_TEMPLATE,
            recipient_email: parsed.email,
            status: "pending",
          });

          await supabase.rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              message_id: confirmId,
              to: parsed.email,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject: confirmSubject,
              html: confirmHtml,
              text: confirmText,
              purpose: "transactional",
              label: CONFIRM_TEMPLATE,
              idempotency_key: confirmId,
              unsubscribe_token: userToken,
              queued_at: new Date().toISOString(),
            },
          });
        } catch (err) {
          console.error("Confirmation email error (non-fatal)", err);
        }

        return Response.json({ success: true });
      },
    },
  },
});
