/**
 * Masquage personnel côté serveur : les notifications (in-app, push, email)
 * déclenchées par une personne masquée ne doivent pas atteindre ceux qui
 * l'ont masquée — sinon le masquage laisse fuir l'activité de la personne
 * via l'inbox et les push alors que ses contenus sont invisibles.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retire des destinataires ceux qui ont masqué l'acteur (l'auteur de
 * l'action qui déclenche la notification).
 */
export async function excludeRecipientsWhoMuted(
  supabaseAdmin: SupabaseClient,
  actorUserId: string,
  recipientIds: string[],
): Promise<string[]> {
  if (recipientIds.length === 0) return recipientIds;
  const { data } = await supabaseAdmin
    .from("user_mutes")
    .select("user_id")
    .eq("muted_user_id", actorUserId)
    .in("user_id", recipientIds);
  const mutedBy = new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  if (mutedBy.size === 0) return recipientIds;
  return recipientIds.filter((id) => !mutedBy.has(id));
}

/** Vrai si `recipientId` a masqué `actorUserId`. */
export async function recipientHasMuted(
  supabaseAdmin: SupabaseClient,
  actorUserId: string,
  recipientId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_mutes")
    .select("id")
    .eq("user_id", recipientId)
    .eq("muted_user_id", actorUserId)
    .maybeSingle();
  return !!data;
}
