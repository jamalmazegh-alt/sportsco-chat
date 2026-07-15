import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Two strictly-separated surfaces for call-up list visibility.
 *
 *  - `useCallUpVisibilityGate(eventId)` reads the effective boolean via
 *    `call_up_list_visible` — safe for ANY authenticated caller (player,
 *    parent, staff). Use it for the badge and for gating UI rendering.
 *
 *  - `useCallUpVisibilityConfig(scope, id)` reads the full cascade config
 *    via `get_call_up_visibility_config`, which is STAFF-ONLY on the server
 *    (RAISE 42501 for non-staff). NEVER mount this hook without an
 *    `enabled: isStaff` guard, otherwise every player opening the page
 *    triggers a 42501 + React Query retry loop.
 *
 * No raw SELECT on team.show_called_up_players_override or
 * clubs.show_called_up_players_default is allowed anywhere in the client.
 * Both forms (event / team / club) read through the single RPC below.
 */

export type CallUpVisibilityScope = "event" | "team" | "club";

export type CallUpVisibilitySource = "event" | "team" | "club";

export interface CallUpVisibilityConfig {
  event_override: boolean | null;
  team_override: boolean | null;
  club_default: boolean;
  effective: boolean;
  source: CallUpVisibilitySource;
}

/** Effective visibility boolean. Safe for any authenticated user. */
export function useCallUpVisibilityGate(eventId: string | null | undefined) {
  return useQuery({
    queryKey: ["call-up-visibility-gate", eventId],
    enabled: Boolean(eventId),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("call_up_list_visible", {
        p_event_id: eventId!,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });
}

/**
 * Staff-only cascade config. The caller MUST pass `enabled` reflecting the
 * staff check (e.g. `enabled: isStaff && Boolean(id)`). React Query is
 * configured with `retry: false` so a server 42501 does not spin.
 */
export function useCallUpVisibilityConfig(
  scope: CallUpVisibilityScope,
  id: string | null | undefined,
  options: { enabled: boolean },
) {
  return useQuery({
    queryKey: ["call-up-visibility-config", scope, id],
    enabled: options.enabled && Boolean(id),
    retry: false,
    queryFn: async (): Promise<CallUpVisibilityConfig> => {
      const { data, error } = await supabase.rpc("get_call_up_visibility_config", {
        _scope: scope,
        _id: id!,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Empty visibility config");
      return {
        event_override: row.event_override,
        team_override: row.team_override,
        club_default: row.club_default,
        effective: row.effective,
        source: row.source as CallUpVisibilitySource,
      };
    },
  });
}
