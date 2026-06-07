import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhookPost } from "@/lib/stripe-webhook-handler.server";

/** Canonical Stripe webhook URL (alias of /api/public/stripe-webhook). */
export const Route = createFileRoute("/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => handleStripeWebhookPost(request),
    },
  },
});
