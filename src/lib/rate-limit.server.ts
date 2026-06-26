import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Best-effort fixed-window per-IP rate limiter backed by `public_rate_limits`.
 * - Trusts cf-connecting-ip first (set by Cloudflare, not client-spoofable).
 * - Increment is atomic via the increment_rate_limit() RPC.
 * - Fail-open on DB error.
 */

export function getClientIp(request: Request): string {
  // cf-connecting-ip is set by Cloudflare and cannot be spoofed by the client.
  // x-forwarded-for IS client-controllable, so it must be the LAST resort.
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
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
    const { data, error } = await supabaseAdmin.rpc("increment_rate_limit" as any, {
      _ip: ip,
      _route: route,
      _window: windowStart,
      _limit: limit,
    });
    if (error) {
      console.warn("[rate-limit] rpc failed, allowing request", {
        route,
        err: error.message,
      });
      return true;
    }
    return data === true;
  } catch (err) {
    console.warn("[rate-limit] check failed, allowing request", {
      route,
      err: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
