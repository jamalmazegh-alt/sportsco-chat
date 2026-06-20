/**
 * Server-side feature flag reader.
 *
 * Reads `public.app_flags` (canonical source of truth shared with SQL via
 * `public.is_v2(key)`) using the service-role client. Falls back to the
 * client `V2_FLAGS` defaults if the row is missing or the lookup fails —
 * any drift between `src/config/features.ts` and `app_flags` should be
 * resolved by updating the DB row (see `docs/beta-v1/feature-matrix.md`).
 *
 * Cached in-memory per-isolate for 60 s to avoid hammering the DB from
 * loops (e.g. crons iterating clubs).
 *
 * Server-only. Never imported from a route file or `*.functions.ts` at
 * module scope — load inside the handler with `await import(...)`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { V2_FLAGS, type V2Flag } from "@/config/features";

const TTL_MS = 60_000;
type CacheEntry = { value: boolean; expiresAt: number };
const cache = new Map<V2Flag, CacheEntry>();

export async function isV2Server(flag: V2Flag): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(flag);
  if (hit && hit.expiresAt > now) return hit.value;

  let value: boolean = V2_FLAGS[flag];
  try {
    const { data } = await supabaseAdmin
      .from("app_flags")
      .select("enabled")
      .eq("key", flag)
      .maybeSingle();
    if (data && typeof data.enabled === "boolean") value = data.enabled;
  } catch {
    /* fall back to client default */
  }

  cache.set(flag, { value, expiresAt: now + TTL_MS });
  return value;
}

/** Test helper — clear cache between assertions. */
export function __clearFeatureFlagCacheForTests() {
  cache.clear();
}
