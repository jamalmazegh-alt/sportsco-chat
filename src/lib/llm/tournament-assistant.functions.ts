/**
 * Sprint 5 Feature 1 — Tournament AI Assistant enrichment.
 *
 *  A. explainRecommendation : short 2-3 sentence narration (cached 7d)
 *  B. answerTournamentQuestion : Q&A bounded to tournament-organisation topics
 *
 * Both server functions return { ok:false } on any failure so the UI can
 * silently fall back to the deterministic experience.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  callLLM,
  cacheGet,
  cacheSet,
  checkLlmRateLimit,
} from "./core.server";

const RecoSchema = z.object({
  pools: z.number().int().min(1).max(16),
  perPool: z.number().int().min(2).max(8),
  flights: z.union([z.literal("champions"), z.null()]),
  format: z.enum(["pools_finals", "round_robin", "single_elim"]),
  totalMatches: z.number().int().min(1).max(500),
  estimatedEndHHMM: z.string().regex(/^\d{2}:\d{2}$/),
  terrainsSuggested: z.number().int().min(1).max(20),
  marginMin: z.number().int(),
  verdict: z.enum(["ok", "warn", "bad"]),
});

const AnswersSchema = z.object({
  teams: z.number().int().min(2).max(64),
  allDay: z.boolean(),
  multipleTrophies: z.boolean(),
  paid: z.boolean(),
});

const ExplainInputSchema = z.object({
  reco: RecoSchema,
  answers: AnswersSchema,
  locale: z.enum(["fr", "en"]).default("fr"),
});

const ExplainOutputSchema = z.object({
  explanation: z.string().min(10).max(400),
});

function recoCacheKey(input: z.infer<typeof ExplainInputSchema>): string {
  const r = input.reco;
  return [
    "tournament_reco_v1",
    input.locale,
    r.format,
    r.pools,
    r.perPool,
    r.flights ?? "none",
    input.answers.allDay ? "allday" : "halfday",
    input.answers.paid ? "paid" : "free",
  ].join(":");
}

export const explainRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ExplainInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const key = recoCacheKey(data);
    const cached = await cacheGet<{ explanation: string }>(key);
    if (cached) return { ok: true as const, data: cached, cached: true };

    const allowed = await checkLlmRateLimit(userId, "tournament_reco", 10);
    if (!allowed) return { ok: false as const };

    const sysFr = `Tu es un assistant d'organisation de tournoi sportif. Tu vas recevoir une recommandation déjà calculée et tu dois EXPLIQUER en 2 à 3 phrases courtes, en français, pourquoi ce format convient. Pas d'emojis. Pas de markdown. Réponse JSON STRICT : {"explanation": "..."}.`;
    const sysEn = `You are a sports-tournament organisation assistant. You receive an already-computed recommendation and must EXPLAIN in 2-3 short sentences, in English, why this format suits the user. No emojis, no markdown. Return STRICT JSON: {"explanation": "..."}.`;

    const prompt = JSON.stringify({
      teams: data.reco.pools * data.reco.perPool,
      pools: data.reco.pools,
      perPool: data.reco.perPool,
      format: data.reco.format,
      flights: data.reco.flights,
      totalMatches: data.reco.totalMatches,
      estimatedEndHHMM: data.reco.estimatedEndHHMM,
      terrains: data.reco.terrainsSuggested,
      allDay: data.answers.allDay,
      multipleTrophies: data.answers.multipleTrophies,
    });

    const res = await callLLM({
      feature: "tournament_reco",
      userId,
      system: data.locale === "fr" ? sysFr : sysEn,
      prompt,
      schema: ExplainOutputSchema,
      jsonResponse: true,
    });
    if (!res.ok) return { ok: false as const };

    await cacheSet(key, "tournament_reco", data.locale, res.data);
    return { ok: true as const, data: res.data, cached: false };
  });

// ---------- B. Q&A ----------

const QuestionInputSchema = z.object({
  question: z.string().min(2).max(500),
  reco: RecoSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(600),
      }),
    )
    .max(6)
    .default([]),
  locale: z.enum(["fr", "en"]).default("fr"),
});

const QuestionOutputSchema = z.object({
  answer: z.string().min(2).max(600),
});

export const answerTournamentQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => QuestionInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    const allowed = await checkLlmRateLimit(userId, "tournament_qa", 10);
    if (!allowed) return { ok: false as const };

    const sysFr = `Tu es un assistant d'organisation de tournoi sportif. Tu réponds UNIQUEMENT aux questions concernant : organisation du tournoi, choix du format, durée, nombre de terrains, gestion des équipes, conseils pratiques. Si la question sort de ce cadre, réponds poliment que tu ne peux pas aider. N'invente JAMAIS de fonctionnalités. Maximum 4 phrases. Réponse JSON STRICT : {"answer": "..."}.`;
    const sysEn = `You are a sports-tournament organisation assistant. Only answer questions about: tournament organisation, format choice, duration, number of courts, team management, practical advice. If the question is off-topic, politely decline. Never invent product features. 4 sentences max. STRICT JSON: {"answer": "..."}.`;

    const historyText = data.history
      .map((h) => `${h.role.toUpperCase()}: ${h.content}`)
      .join("\n");
    const prompt = `Contexte de la recommandation:\n${JSON.stringify({
      format: data.reco.format,
      pools: data.reco.pools,
      perPool: data.reco.perPool,
      flights: data.reco.flights,
      totalMatches: data.reco.totalMatches,
      estimatedEnd: data.reco.estimatedEndHHMM,
      terrains: data.reco.terrainsSuggested,
    })}\n\nHistorique:\n${historyText || "(aucun)"}\n\nQuestion: ${data.question}`;

    const res = await callLLM({
      feature: "tournament_qa",
      userId,
      system: data.locale === "fr" ? sysFr : sysEn,
      prompt,
      schema: QuestionOutputSchema,
      jsonResponse: true,
    });
    if (!res.ok) return { ok: false as const };
    return { ok: true as const, data: res.data };
  });
