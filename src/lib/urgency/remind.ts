// Helper remind-all : envoie un rappel à toutes les convocations pending
// d'un event. Rate-limit 30min/convocation (réutilise la règle existante
// de follow-ups.tsx). Retourne le nombre de rappels effectivement envoyés.

import { supabase } from "@/integrations/supabase/client";

const RATE_LIMIT_MS = 30 * 60 * 1000;

export async function remindAllForEvent(
  eventId: string,
  senderUserId: string,
  promptText: string,
  eventTitle: string,
): Promise<number> {
  const { data: convocs } = await supabase
    .from("convocations")
    .select("id, player_id")
    .eq("event_id", eventId)
    .eq("status", "pending");
  if (!convocs || convocs.length === 0) return 0;

  let sent = 0;
  for (const c of convocs) {
    const { data: recent } = await supabase
      .from("reminders")
      .select("id, sent_at")
      .eq("convocation_id", c.id)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (
      recent &&
      recent[0] &&
      Date.now() - new Date(recent[0].sent_at).getTime() < RATE_LIMIT_MS
    ) {
      continue;
    }

    const { data: parents } = await supabase
      .from("player_parents")
      .select("parent_user_id")
      .eq("player_id", c.player_id);
    const { data: playerRow } = await supabase
      .from("players")
      .select("user_id")
      .eq("id", c.player_id)
      .maybeSingle();
    const recipients = Array.from(
      new Set([
        ...(playerRow?.user_id ? [playerRow.user_id] : []),
        ...((parents ?? []).map((p) => p.parent_user_id).filter(Boolean) as string[]),
      ]),
    );

    await supabase.from("reminders").insert({
      convocation_id: c.id,
      channel: "in_app",
      sent_by: senderUserId,
    });
    if (recipients.length > 0) {
      await supabase.from("notifications").insert(
        recipients.map((uid) => ({
          user_id: uid,
          type: "reminder",
          title: eventTitle,
          body: promptText,
          link: `/events/${eventId}`,
        })),
      );
    }
    sent += 1;
  }
  return sent;
}
