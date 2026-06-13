/**
 * Sprint 5 — LLM core helpers (server-only).
 *
 * Guarantees:
 *  - 5s timeout (AbortController) on every call
 *  - Silent fallback: callers receive { ok:false } on any error
 *  - All responses are validated through Zod before reaching callers
 *  - Every call logs to public.llm_usage
 *  - Best-effort cache via public.llm_cache (server-side only)
 *  - Rate-limit via public.public_rate_limits (hourly bucket, ip=user_id)
 */
import { generateText } from "ai";
import type { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = 5000;
const CACHE_TTL_DAYS = 7;

export type LLMFeature =
  | "tournament_reco"
  | "tournament_qa"
  | "coach_insights"
  | "coach_insights_refresh"
  | "tournament_rules";

type LogStatus = "ok" | "timeout" | "invalid_json" | "rate_limited" | "error";

async function logUsage(
  userId: string | null,
  clubId: string | null,
  feature: LLMFeature,
  model: string,
  status: LogStatus,
  tokensIn = 0,
  tokensOut = 0,
) {
  try {
    await supabaseAdmin.from("llm_usage").insert({
      user_id: userId,
      club_id: clubId,
      feature,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      status,
    });
  } catch {
    // swallow — never block on logging
  }
}

/**
 * Anonymise une liste de joueurs : retourne le mapping id → "Joueur A/B/…"
 * et la fonction `label(id)`. Aucun nom/email ne quitte le serveur.
 */
export function anonymizePlayers(playerIds: string[]) {
  const map = new Map<string, string>();
  playerIds.forEach((id, i) => {
    // A..Z then AA, AB…
    const letter =
      i < 26
        ? String.fromCharCode(65 + i)
        : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`;
    map.set(id, `Joueur ${letter}`);
  });
  return {
    map,
    label: (id: string) => map.get(id) ?? "Joueur ?",
  };
}

/**
 * Catégorie d'âge à partir de l'âge réel (jamais l'âge brut dans le prompt).
 */
export function ageToCategory(age: number | null): string {
  if (age == null) return "U?";
  if (age < 7) return "U7";
  if (age < 9) return "U9";
  if (age < 11) return "U11";
  if (age < 13) return "U13";
  if (age < 15) return "U15";
  if (age < 17) return "U17";
  if (age < 19) return "U19";
  if (age < 21) return "U21";
  return "Senior";
}

/**
 * Hourly fixed-window rate limiter using public_rate_limits.
 * Distinct from the public-route limiter (different bucket prefix).
 */
export async function checkLlmRateLimit(
  userId: string,
  feature: string,
  limit: number,
): Promise<boolean> {
  const windowStart = new Date();
  windowStart.setUTCMinutes(0, 0, 0);
  const ws = windowStart.toISOString();
  const route = `llm:${feature}`;
  try {
    await supabaseAdmin
      .from("public_rate_limits")
      .upsert(
        { ip: userId, route, window_start: ws, count: 0 },
        { onConflict: "ip,route,window_start", ignoreDuplicates: true },
      );
    const { data: row } = await supabaseAdmin
      .from("public_rate_limits")
      .select("count")
      .eq("ip", userId)
      .eq("route", route)
      .eq("window_start", ws)
      .maybeSingle();
    const current = row?.count ?? 0;
    if (current >= limit) return false;
    await supabaseAdmin
      .from("public_rate_limits")
      .update({ count: current + 1 })
      .eq("ip", userId)
      .eq("route", route)
      .eq("window_start", ws);
    return true;
  } catch {
    // Fail-open
    return true;
  }
}

/**
 * Daily fixed-window rate limiter (per-bucket-id like tournamentId or userId).
 * Bucket window = current UTC day.
 */
export async function checkLlmDailyLimit(
  bucketId: string,
  feature: string,
  limit: number,
): Promise<boolean> {
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);
  const ws = windowStart.toISOString();
  const route = `llm-daily:${feature}`;
  try {
    await supabaseAdmin
      .from("public_rate_limits")
      .upsert(
        { ip: bucketId, route, window_start: ws, count: 0 },
        { onConflict: "ip,route,window_start", ignoreDuplicates: true },
      );
    const { data: row } = await supabaseAdmin
      .from("public_rate_limits")
      .select("count")
      .eq("ip", bucketId)
      .eq("route", route)
      .eq("window_start", ws)
      .maybeSingle();
    const current = row?.count ?? 0;
    if (current >= limit) return false;
    await supabaseAdmin
      .from("public_rate_limits")
      .update({ count: current + 1 })
      .eq("ip", bucketId)
      .eq("route", route)
      .eq("window_start", ws);
    return true;
  } catch {
    return true;
  }
}

// ----- Cache helpers ---------------------------------------------------------

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const { data } = await supabaseAdmin
      .from("llm_cache")
      .select("response, created_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (!data) return null;
    const ageMs = Date.now() - new Date(data.created_at as string).getTime();
    if (ageMs > CACHE_TTL_DAYS * 86400 * 1000) return null;
    return data.response as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  feature: LLMFeature,
  locale: string,
  response: unknown,
): Promise<void> {
  try {
    await supabaseAdmin
      .from("llm_cache")
      .upsert({ cache_key: key, feature, locale, response: response as object });
  } catch {
    /* ignore */
  }
}

// ----- Core call -------------------------------------------------------------

export interface CallLLMOptions<T> {
  feature: LLMFeature;
  userId: string | null;
  clubId?: string | null;
  system: string;
  prompt: string;
  schema: z.ZodSchema<T>;
  /** Expect a JSON-shaped response (the helper will strip code fences and parse). */
  jsonResponse?: boolean;
  timeoutMs?: number;
  model?: string;
}

export type CallLLMResult<T> = { ok: true; data: T } | { ok: false };

/**
 * One-shot call with timeout + Zod validation + usage logging.
 * NEVER throws — always returns { ok:false } on any failure.
 */
export async function callLLM<T>(opts: CallLLMOptions<T>): Promise<CallLLMResult<T>> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const model = opts.model ?? DEFAULT_MODEL;
  if (!apiKey) {
    await logUsage(opts.userId, opts.clubId ?? null, opts.feature, model, "error");
    return { ok: false };
  }
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const gateway = createLovableAiGatewayProvider(apiKey);
    const { text, usage } = await generateText({
      model: gateway(model),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      abortSignal: controller.signal,
    });
    clearTimeout(timer);

    let parsedRaw: unknown = text;
    if (opts.jsonResponse) {
      const cleaned = String(text)
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      try {
        parsedRaw = JSON.parse(cleaned);
      } catch {
        await logUsage(
          opts.userId,
          opts.clubId ?? null,
          opts.feature,
          model,
          "invalid_json",
          usage?.inputTokens ?? 0,
          usage?.outputTokens ?? 0,
        );
        return { ok: false };
      }
    }

    const validated = opts.schema.safeParse(parsedRaw);
    if (!validated.success) {
      await logUsage(
        opts.userId,
        opts.clubId ?? null,
        opts.feature,
        model,
        "invalid_json",
        usage?.inputTokens ?? 0,
        usage?.outputTokens ?? 0,
      );
      return { ok: false };
    }

    await logUsage(
      opts.userId,
      opts.clubId ?? null,
      opts.feature,
      model,
      "ok",
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
    );
    return { ok: true, data: validated.data };
  } catch (err) {
    clearTimeout(timer);
    const status: LogStatus = controller.signal.aborted ? "timeout" : "error";
    await logUsage(opts.userId, opts.clubId ?? null, opts.feature, model, status);
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[llm:${opts.feature}] ${status}`, (err as Error)?.message);
    }
    return { ok: false };
  }
}

// ----- HTML sanitization (very restricted whitelist) ------------------------

const ALLOWED_TAGS = new Set(["h2", "p", "ul", "li", "strong"]);

/**
 * Whitelist-based HTML sanitizer.
 * - Strips every tag not in ALLOWED_TAGS (keeps inner text).
 * - Strips every attribute.
 * - Removes <script>, <style>, <iframe>, <img>, on* handlers, etc. entirely (tag + content).
 */
export function sanitizeRestrictedHtml(input: string): string {
  if (!input) return "";
  // Hard-strip dangerous tags AND their content.
  let out = input.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|svg)[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  // Self-closing dangerous tags
  out = out.replace(/<\s*(img|input|source|track|br|hr)[^>]*\/?>/gi, "");
  // For remaining tags: keep allowed ones (no attributes), strip everything else.
  out = out.replace(/<\s*\/?\s*([a-zA-Z0-9]+)\b[^>]*>/g, (_m, tag: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return "";
    const isClosing = /^<\s*\//.test(_m);
    return isClosing ? `</${t}>` : `<${t}>`;
  });
  return out.trim();
}
