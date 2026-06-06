/**
 * Tiny server-side structured logger with PII redaction.
 *
 * Use for any server-side log line that might end up shipped to a log
 * aggregator. Output is single-line JSON, ISO timestamp, level, scope,
 * msg, plus arbitrary context fields. Sensitive fields (email, token,
 * authorization, secret, password, api_key, stripe_*) are masked.
 *
 * Usage:
 *   import { createLogger } from "@/lib/logger.server";
 *   const log = createLogger("superadmin");
 *   log.info("club_archived", { clubId });
 *   log.error("stripe_overview_failed", { err });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = new Set([
  "email",
  "recipient_email",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "secret",
  "api_key",
  "apikey",
  "stripe_customer_id",
  "stripe_subscription_id",
  "phone",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[Object]";
  if (value == null) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.has(k.toLowerCase())) {
        out[k] = typeof v === "string" && v.length > 0 ? "[REDACTED]" : v;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function emit(
  level: LogLevel,
  scope: string,
  msg: string,
  ctx?: Record<string, unknown>,
) {
  const line = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(ctx ? (redact(ctx) as Record<string, unknown>) : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) =>
      emit("debug", scope, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) =>
      emit("info", scope, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) =>
      emit("warn", scope, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) =>
      emit("error", scope, msg, ctx),
  };
}
