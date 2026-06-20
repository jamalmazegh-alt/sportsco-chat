/**
 * Server-side feature flag reader.
 *
 * Reads `public.app_flags` (canonical source of truth shared with SQL via
 * `public.is_v2(key)`) using the service-role client. **Fail-closed**: if
 * the row is missing or the DB call errors, returns `false` and does NOT
 * cache — preventing a transient outage from re-enabling a masked feature.
 *
 * Successful reads are cached in-memory per-isolate for 60 s.
 *
 * Server-only. Never imported from a route file or `*.functions.ts` at
 * module scope — load inside the handler with `await import(...)`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type V2Flag } from "@/config/features";

const TTL_MS = 60_000;
type CacheEntry = { value: boolean; expiresAt: number };
const cache = new Map<V2Flag, CacheEntry>();

export async function isV2Server(flag: V2Flag): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(flag);
  if (hit && hit.expiresAt > now) return hit.value;

  // Fail-closed: if the DB lookup fails or the row is missing, default to
  // `false` so a transient outage cannot accidentally re-enable a masked V2
  // feature. Only successful reads are cached.
  let resolved = false;
  let value = false;
  try {
    const { data, error } = await supabaseAdmin
      .from("app_flags")
      .select("enabled")
      .eq("key", flag)
      .maybeSingle();
    if (!error && data && typeof data.enabled === "boolean") {
      value = data.enabled;
      resolved = true;
    }
  } catch {
    /* fail-closed — do not cache */
  }

  if (resolved) cache.set(flag, { value, expiresAt: now + TTL_MS });
  return value;
}

/** Test helper — clear cache between assertions. */
export function __clearFeatureFlagCacheForTests() {
  cache.clear();
}
