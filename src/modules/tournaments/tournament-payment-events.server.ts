import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLogger } from "@/lib/logger.server";

const log = createLogger("tournament-payment-events");

export async function logPaymentEvent(
  tournamentId: string | null,
  registrationId: string | null,
  eventType: string,
  amount: number | null,
  metadata: Record<string, unknown>,
  stripeEventId: string | null = null,
  actorId: string | null = null,
): Promise<void> {
  try {
    await supabaseAdmin.from("tournament_payment_events").insert({
      tournament_id: tournamentId,
      registration_id: registrationId,
      event_type: eventType,
      amount,
      stripe_event_id: stripeEventId,
      actor_id: actorId,
      metadata: metadata as unknown as never,
    });
  } catch (e) {
    log.error("Failed to insert payment event", { eventType, error: String(e) });
  }
}