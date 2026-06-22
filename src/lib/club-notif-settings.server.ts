/**
 * Per-club notification toggles. Cached in-memory for 60s so a busy fan-out
 * (e.g. wall post or 100% complete) doesn't issue one DB read per recipient.
 *
 * All gates are SOFT: when a toggle is OFF, the push is silently skipped.
 * The corresponding email (when any) still goes out — these toggles only
 * govern Web Push.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ClubNotifSettings = {
  convocation_on_create: boolean;
  convocation_reminder: boolean;
  convocation_coach_each_response: boolean;
  convocation_coach_complete: boolean;
  event_reschedule: boolean;
  event_cancel: boolean;
  score_result: boolean;
  wall_new_post: boolean;
  tournament_match_reminder: boolean;
  tournament_draw: boolean;
};

export const DEFAULT_CLUB_NOTIF_SETTINGS: ClubNotifSettings = {
  convocation_on_create: true,
  convocation_reminder: true,
  convocation_coach_each_response: true,
  convocation_coach_complete: true,
  event_reschedule: true,
  event_cancel: true,
  score_result: true,
  wall_new_post: true,
  tournament_match_reminder: true,
  tournament_draw: true,
};

const CACHE_TTL_MS = 60_000;
type Entry = { value: ClubNotifSettings; expiresAt: number };
const cache = new Map<string, Entry>();

export async function getClubNotifSettings(
  clubId: string | null | undefined,
): Promise<ClubNotifSettings> {
  if (!clubId) return DEFAULT_CLUB_NOTIF_SETTINGS;
  const now = Date.now();
  const cached = cache.get(clubId);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const { data } = await supabaseAdmin
      .from("club_notification_settings")
      .select(
        "convocation_on_create, convocation_reminder, convocation_coach_each_response, convocation_coach_complete, event_reschedule, event_cancel, score_result, wall_new_post, tournament_match_reminder, tournament_draw",
      )
      .eq("club_id", clubId)
      .maybeSingle();

    const value: ClubNotifSettings = data
      ? {
          convocation_on_create: (data as any).convocation_on_create ?? true,
          convocation_reminder: (data as any).convocation_reminder ?? true,
          convocation_coach_each_response:
            (data as any).convocation_coach_each_response ?? false,
          convocation_coach_complete: (data as any).convocation_coach_complete ?? true,
          event_reschedule: (data as any).event_reschedule ?? true,
          event_cancel: (data as any).event_cancel ?? true,
          score_result: (data as any).score_result ?? true,
          wall_new_post: (data as any).wall_new_post ?? true,
          tournament_match_reminder: (data as any).tournament_match_reminder ?? true,
          tournament_draw: (data as any).tournament_draw ?? true,
        }
      : DEFAULT_CLUB_NOTIF_SETTINGS;

    cache.set(clubId, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch {
    return DEFAULT_CLUB_NOTIF_SETTINGS;
  }
}

/** Clear cache for a club — call after writing settings. */
export function invalidateClubNotifSettings(clubId: string): void {
  cache.delete(clubId);
}
