/**
 * POST /api/public/waitlist — V2 feature waitlist capture (vitrine).
 *
 * Security posture (non-negotiable):
 * - Inserts via service-role only (table has RLS on, zero policy → locked
 *   for anon/authenticated).
 * - Honeypot + per-IP rate-limit (reused from /inquiry).
 * - Returns 200 even on duplicate / soft-failure to avoid existence leak.
 * - No PII logged.
 * - No feature-flag mutation — pure data capture, zero app unlock.
 */
import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";

const RATE_LIMIT_PER_HOUR = 10;

const FEATURE_KEYS = [
  "player_network",
  "public_profiles",
  "payments",
  "fundraising",
  "championships",
  "championship_stats",
] as const;

const ROLE_KEYS = [
  "coach",
  "admin",
  "tournament_organizer",
  "parent",
  "player",
] as const;

const WaitlistSchema = z.object({
  email: z.string().trim().email().max(255),
  features: z.array(z.enum(FEATURE_KEYS)).min(1).max(FEATURE_KEYS.length),
  role: z.enum(ROLE_KEYS).optional(),
  marketing_consent: z.boolean().default(false),
  source: z.string().trim().max(60).optional().default("landing"),
  // Honeypot — bots fill every field.
  website: z.string().max(0).optional().default(""),
});

export const Route = createFileRoute("/api/public/waitlist")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let parsed: z.infer<typeof WaitlistSchema>;
        try {
          parsed = WaitlistSchema.parse(await request.json());
        } catch {
          // Generic 400 — never echo validation details.
          return Response.json({ success: true });
        }

        // Honeypot: silently accept and drop.
        if (parsed.website && parsed.website.length > 0) {
          return Response.json({ success: true });
        }

        const ip = getClientIp(request);
        const allowed = await checkRateLimit(ip, "waitlist", RATE_LIMIT_PER_HOUR);
        if (!allowed) {
          // Same 200 — never leak rate-limit existence to scrapers.
          return Response.json({ success: true });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
          const normalizedEmail = parsed.email.toLowerCase();
          await supabaseAdmin.from("waitlist_interest").insert({
            email: normalizedEmail,
            features: parsed.features,
            role: parsed.role ?? null,
            marketing_consent: parsed.marketing_consent,
            consent_at: parsed.marketing_consent ? new Date().toISOString() : null,
            source: parsed.source || "landing",
          });

          // Accusé de réception utilisateur
          const acceptLang = request.headers.get("accept-language") ?? "";
          const locale = acceptLang.slice(0, 2).toLowerCase();
          await enqueueTransactionalEmailServer({
            templateName: "waitlist-confirmation",
            recipientEmail: normalizedEmail,
            idempotencyKey: `waitlist-confirm-${normalizedEmail}-${parsed.features.join(",")}`,
            templateData: { features: parsed.features, locale },
          }).catch((err) => console.error("[waitlist] user confirmation enqueue failed:", err));

          // Notification interne (hello@clubero.app — fixé dans le template)
          await enqueueTransactionalEmailServer({
            templateName: "waitlist-admin-notification",
            idempotencyKey: `waitlist-admin-${normalizedEmail}-${Date.now()}`,
            templateData: {
              email: normalizedEmail,
              features: parsed.features,
              role: parsed.role ?? null,
              marketing_consent: parsed.marketing_consent,
              source: parsed.source || "landing",
            },
          }).catch((err) => console.error("[waitlist] admin notification enqueue failed:", err));
        } catch (err) {
          // Swallow — never leak DB state. Response stays 200.
          console.error("[waitlist] insert failed:", err);
        }

        return Response.json({ success: true });
      },
    },
  },
});
