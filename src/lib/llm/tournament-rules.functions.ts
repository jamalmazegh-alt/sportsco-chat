/**
 * Sprint 5 Feature 3 — AI-generated tournament rules.
 *
 * Whitelist HTML (h2, p, ul, li, strong). Daily limit 5/tournament.
 * Caller (organiser) must own/manage the tournament.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  callLLM,
  checkLlmDailyLimit,
  sanitizeRestrictedHtml,
} from "./core.server";

const InputSchema = z.object({
  tournamentId: z.string().uuid(),
  locale: z.enum(["fr", "en"]).default("fr"),
});

const OutputSchema = z.object({
  html: z.string().min(20).max(6000),
});

function fallbackHtml(t: {
  name?: string | null;
  sport?: string | null;
  format?: string | null;
  starts_at?: string | null;
}): string {
  const name = t.name ?? "Tournoi";
  const sport = t.sport ?? "";
  const fmt = t.format ?? "";
  return sanitizeRestrictedHtml(`
<h2>Règlement — ${name}</h2>
<p>Ce règlement s'applique à toutes les équipes et joueurs inscrits au tournoi${sport ? ` de ${sport}` : ""}.</p>
<h2>Format</h2>
<p>${fmt || "Format à préciser par l'organisateur."}</p>
<h2>Règles générales</h2>
<ul><li>Respect des adversaires et des arbitres obligatoire.</li><li>Tenue de sport adaptée requise.</li><li>L'organisateur peut adapter le règlement en cas de force majeure.</li></ul>
  `);
}

export const generateTournamentRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Authorise: caller must be able to read the tournament via RLS.
    const { data: tournament, error } = await supabase
      .from("tournaments")
      .select("id, name, sport, format, starts_at, ends_at, location, category, club_id")
      .eq("id", data.tournamentId)
      .maybeSingle();
    if (error || !tournament) {
      return { ok: false as const, reason: "not_found" as const };
    }

    // 2. Daily rate-limit per tournament
    const allowed = await checkLlmDailyLimit(data.tournamentId, "tournament_rules", 5);
    if (!allowed) {
      return {
        ok: false as const,
        reason: "rate_limited" as const,
        fallback: fallbackHtml(tournament as any),
      };
    }

    const sysFr = `Tu rédiges le règlement d'un tournoi sportif. Produis un règlement clair en HTML restreint, uniquement avec les balises <h2>, <p>, <ul>, <li>, <strong>. Pas d'attributs, pas d'autres balises, pas de markdown. 4 à 8 sections maximum. Réponse JSON STRICT : {"html": "<h2>...</h2>..."}`;
    const sysEn = `You write a sports tournament ruleset. Output clean HTML using ONLY <h2>, <p>, <ul>, <li>, <strong>. No attributes, no other tags, no markdown. 4-8 sections max. STRICT JSON: {"html": "<h2>...</h2>..."}`;

    const prompt = JSON.stringify({
      name: tournament.name,
      sport: tournament.sport,
      format: tournament.format,
      category: (tournament as any).category ?? null,
      location: (tournament as any).location ?? null,
      starts_at: (tournament as any).starts_at ?? null,
      ends_at: (tournament as any).ends_at ?? null,
    });

    const res = await callLLM({
      feature: "tournament_rules",
      userId,
      clubId: (tournament as any).club_id ?? null,
      system: data.locale === "fr" ? sysFr : sysEn,
      prompt,
      schema: OutputSchema,
      jsonResponse: true,
      timeoutMs: 8000, // règlement plus long → tolérance étendue
    });
    if (!res.ok) {
      return {
        ok: false as const,
        reason: "llm_error" as const,
        fallback: fallbackHtml(tournament as any),
      };
    }

    const clean = sanitizeRestrictedHtml(res.data.html);
    if (clean.length < 20) {
      return {
        ok: false as const,
        reason: "llm_error" as const,
        fallback: fallbackHtml(tournament as any),
      };
    }
    return { ok: true as const, html: clean };
  });
