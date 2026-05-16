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
const TEMPLATE_NAME = "inbound-inquiry";

const InquirySchema = z.object({
  kind: z.enum(["contact", "demo"]),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  club: z.string().trim().max(160).optional().default(""),
  role: z.string().trim().max(120).optional().default(""),
  teams: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(4000).optional().default(""),
  notes: z.string().trim().max(4000).optional().default(""),
});

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

        const template = TEMPLATES[TEMPLATE_NAME];
        if (!template?.to) {
          return Response.json({ error: "Template missing" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey);
        const messageId = crypto.randomUUID();

        const element = React.createElement(template.component, parsed);
        const html = await render(element);
        const text = await render(element, { plainText: true });
        const subject =
          typeof template.subject === "function"
            ? template.subject(parsed)
            : template.subject;

        const safeName = parsed.name.replace(/[\r\n<>"]/g, "").slice(0, 80);
        const safeEmail = parsed.email.replace(/[\r\n<>"]/g, "");
        const replyTo = `${safeName} <${safeEmail}>`;

        await supabase.from("email_send_log").insert({
          message_id: messageId,
          template_name: TEMPLATE_NAME,
          recipient_email: template.to,
          status: "pending",
        });

        const { error: enqueueError } = await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: template.to,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            reply_to: replyTo,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text,
            purpose: "transactional",
            label: TEMPLATE_NAME,
            idempotency_key: messageId,
            queued_at: new Date().toISOString(),
          },
        });

        if (enqueueError) {
          console.error("Failed to enqueue inquiry email", enqueueError);
          await supabase.from("email_send_log").insert({
            message_id: messageId,
            template_name: TEMPLATE_NAME,
            recipient_email: template.to,
            status: "failed",
            error_message: "Failed to enqueue email",
          });
          return Response.json({ error: "Failed to send" }, { status: 500 });
        }

        return Response.json({ success: true });
      },
    },
  },
});
