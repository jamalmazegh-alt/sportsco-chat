import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_CLUB_TZ, resolveClubTz } from "@/lib/time/club-tz";

const cache = new Map<string, string>();

/** Fuseau horaire du club (repli Europe/Paris), mis en cache par requête. */
export async function getClubTz(clubId?: string | null): Promise<string> {
  if (!clubId) return DEFAULT_CLUB_TZ;
  const hit = cache.get(clubId);
  if (hit) return hit;
  const { data } = await supabaseAdmin
    .from("clubs")
    .select("timezone")
    .eq("id", clubId)
    .maybeSingle();
  const tz = resolveClubTz((data as { timezone?: string | null } | null)?.timezone ?? null);
  cache.set(clubId, tz);
  return tz;
}
