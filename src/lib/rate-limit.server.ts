import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Best-effort fixed-window per-IP rate limiter backed by `public_rate_limits`.
 *
 * - Window granularity: 1 hour (UTC, truncated to the hour).
 * - Storage: one row per (ip, route, window_start). Counter incremented in place.
 * - Fail-open: if the DB call errors, we let the request through rather than
 *   block legitimate traffic on a transient backend issue.
 */

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function currentHourBucket(): string {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/**
 * Returns true when the request is within the allowed quota, false when it
 * should be rejected with HTTP 429.
 */
export async function checkRateLimit(
  ip: string,
  route: string,
  limit: number,
): Promise<boolean> {
  const windowStart = currentHourBucket();
  try {
    // Upsert (no-op on conflict) to make sure the row exists, then increment.
    await supabaseAdmin
      .from("public_rate_limits")
      .upsert(
        { ip, route, window_start: windowStart, count: 0 },
        { onConflict: "ip,route,window_start", ignoreDuplicates: true },
      );

    const { data: row } = await supabaseAdmin
      .from("public_rate_limits")
      .select("count")
      .eq("ip", ip)
      .eq("route", route)
      .eq("window_start", windowStart)
      .maybeSingle();

    const current = row?.count ?? 0;
    if (current >= limit) return false;

    await supabaseAdmin
      .from("public_rate_limits")
      .update({ count: current + 1 })
      .eq("ip", ip)
      .eq("route", route)
      .eq("window_start", windowStart);

    return true;
  } catch (err) {
    console.warn("[rate-limit] check failed, allowing request", {
      route,
      err: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
