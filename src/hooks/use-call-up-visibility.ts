import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/**
 * UI state for the selector.
 *  - `event` / `team`: three-way (nullable override in DB).
 *  - `club`: two-way (non-nullable default in DB).
 */
export type CallUpVisibilityChoiceNullable = "inherit" | "visible" | "masked";
export type CallUpVisibilityChoiceStrict = "visible" | "masked";

/**
 * Explicit UI → column mapping. The mapping is the whole point of the
 * three-way selector: "inherit" must persist as NULL, NEVER as the resolved
 * effective boolean. Writing the effective boolean would freeze the current
 * cascade result into an override, breaking future propagation from the
 * parent scope.
 *
 *   inherit → null    (delete the override, let cascade decide)
 *   visible → true    (explicit override)
 *   masked  → false   (explicit override)
 *
 * `club` scope has no `inherit`: the club is the root of the cascade and
 * its column is NOT NULL. Passing "inherit" for club is a programming error.
 */
export function callUpChoiceToColumn(choice: CallUpVisibilityChoiceNullable): boolean | null {
  if (choice === "inherit") return null;
  if (choice === "visible") return true;
  return false;
}

export function callUpChoiceToClubColumn(choice: CallUpVisibilityChoiceStrict): boolean {
  return choice === "visible";
}

/**
 * Mutation for persisting a visibility choice at any scope.
 *
 * WRITE PATH IS A GATED RPC, NOT `.update()`.
 *
 * `set_call_up_visibility(scope, id, choice)` is SECURITY DEFINER and re-runs
 * the exact same staff-gate block as `get_call_up_visibility_config`
 * (event → `is_team_staff_of_event`; team → `is_team_coach OR
 * has_club_role(admin)`; club → `is_club_staff`). Read and write share one
 * guard — a role able to edit an event via the generic events UPDATE
 * policy CANNOT flip `show_called_up_players_*` here.
 *
 * Never re-introduce a direct `supabase.from('events'|'teams'|'clubs').update()`
 * on `show_called_up_players_*` — Postgres has no column-level gating in
 * policies and the table-wide UPDATE policies are broader than this field.
 *
 * On success, invalidates BOTH visibility query families by PREFIX
 * (`["call-up-visibility-gate"]`, `["call-up-visibility-config"]`), never by
 * exact key: a team-level change flips the effective value on every event
 * of that team currently in `inherit`, and we cannot enumerate those event
 * ids. A club-level change fans out even wider. Both query bodies are tiny
 * (a boolean / a small object), staff-only, and setting mutations are rare,
 * so the over-invalidation cost is negligible and it eliminates a whole
 * class of stale-badge bugs.
 */
export function useSetCallUpVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args:
        | { scope: "event"; id: string; choice: CallUpVisibilityChoiceNullable }
        | { scope: "team"; id: string; choice: CallUpVisibilityChoiceNullable }
        | { scope: "club"; id: string; choice: CallUpVisibilityChoiceStrict },
    ) => {
      const { error } = await supabase.rpc("set_call_up_visibility", {
        _scope: args.scope,
        _id: args.id,
        _choice: args.choice,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Prefix invalidation — see doc block above.
      qc.invalidateQueries({ queryKey: ["call-up-visibility-gate"] });
      qc.invalidateQueries({ queryKey: ["call-up-visibility-config"] });
    },
  });
}
