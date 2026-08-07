import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_CLUB_TZ, resolveClubTz } from "@/lib/time/club-tz";

const TTL_MS = 60_000;
const cache = new Map<string, { tz: string; at: number }>();

/** Vide le cache (à appeler après une mise à jour du fuseau d'un club). */
export function invalidateClubTz(clubId?: string | null): void {
  if (clubId) cache.delete(clubId);
  else cache.clear();
}

/** Fuseau horaire du club (repli Europe/Paris), mis en cache 60 s. */
export async function getClubTz(clubId?: string | null): Promise<string> {
  if (!clubId) return DEFAULT_CLUB_TZ;
  const hit = cache.get(clubId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tz;
  const { data } = await supabaseAdmin
    .from("clubs")
    .select("timezone")
    .eq("id", clubId)
    .maybeSingle();
  const tz = resolveClubTz((data as { timezone?: string | null } | null)?.timezone ?? null);
  cache.set(clubId, { tz, at: Date.now() });
  return tz;
}
