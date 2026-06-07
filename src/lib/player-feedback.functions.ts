import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

// Tag catalog lives in `src/lib/feedback-tags.ts` (sport-aware).
// Tags are stored as free-form strings (validated as `z.string().min(1).max(40)`)
// so no enum needs to be enforced on the server.

export const VISIBILITY_VALUES = [
  "coach_only",
  "staff",
  "share_summary",
  "parent_summary",
  "player_summary",
] as const;

const FeedbackVisibility = z.enum(VISIBILITY_VALUES);
const ReviewKind = z.enum(["end_of_season", "meeting", "development", "coaching"]);

type PlayerReviewRow = {
  id: string;
  kind: string;
  period_start: string | null;
  period_end: string | null;
  content: string;
  visibility: string;
  model: string | null;
  created_at: string;
  author_user_id: string;
};

const FRENCH_NUMBER_WORDS: Record<string, number> = {
  une: 1,
  un: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
};

function getRequestedSentenceCount(instruction: string) {
  const normalized = instruction.toLowerCase();
  if (!/phras/.test(normalized)) return null;
  const digit = normalized.match(/(?:en|dans|sur|de)?\s*(\d{1,2})\s+\w*phras/i)?.[1];
  if (digit) return Number(digit);
  const word = normalized.match(/(?:en|dans|sur|de)?\s*(une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+\w*phras/i)?.[1];
  return word ? FRENCH_NUMBER_WORDS[word] ?? null : null;
}

function splitSentences(content: string) {
  return (content.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function cleanReviewContent(content: string) {
  return content
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*(voici|bien sûr|d'accord)[^\n]*\n+/i, "")
    .trim();
}

function locallyLimitSentences(content: string, sentenceCount: number) {
  const withoutHeadings = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\*\*(.+?)\*\*\s*$/gm, "$1.")
    .replace(/^\s*[-*]\s+/gm, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => /[.!?…]$/.test(line) ? line : `${line}.`)
    .join(" ");
  const sentences = splitSentences(withoutHeadings);
  return sentences.slice(0, sentenceCount).join(" ").trim();
}

function localInstructionFallback(content: string, requestedSentenceCount: number | null) {
  if (!requestedSentenceCount) return "";
  return locallyLimitSentences(content, requestedSentenceCount);
}

function hasVisibleDifference(before: string, after: string) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  return normalize(before) !== normalize(after);
}

const FeedbackInput = z.object({
  playerId: z.string().uuid(),
  eventId: z.string().uuid().nullish(),
  rating: z.number().int().min(1).max(10).nullish(),
  comment: z.string().trim().max(4000).nullish(),
  devNotes: z.string().trim().max(4000).nullish(),
  strengths: z.string().trim().max(2000).nullish(),
  improvements: z.string().trim().max(2000).nullish(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  visibility: FeedbackVisibility.default("coach_only"),
  sharedSummary: z.string().trim().max(2000).nullish(),
});

async function assertStaffCanViewPlayerFeedback(
  supabase: { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown }> },
  userId: string,
  playerId: string,
) {
  const { data: adminOk } = await supabase.rpc("is_player_club_admin", {
    _user_id: userId,
    _player_id: playerId,
  });
  if (adminOk) return;
  const { data: coachOk } = await supabase.rpc("can_author_player_feedback", {
    _user_id: userId,
    _player_id: playerId,
  });
  if (!coachOk) throw new Response("Forbidden", { status: 403 });
}

// ------------------------------------------------------------------
// List feedbacks for a player (staff-only; RLS also filters by visibility).
// ------------------------------------------------------------------
export const listPlayerFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { playerId: string }) =>
    z.object({ playerId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaffCanViewPlayerFeedback(supabase, userId, data.playerId);
    const { data: rows, error } = await supabase
      .from("player_feedback" as any)
      .select(
        "id, event_id, author_user_id, rating, comment, dev_notes, strengths, improvements, tags, visibility, shared_summary, created_at, team_id, club_id"
      )
      .eq("player_id", data.playerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });

    const authorIds = Array.from(new Set((rows ?? []).map((r: any) => r.author_user_id)));
    const eventIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.event_id).filter(Boolean))
    );
    const [authorsRes, eventsRes] = await Promise.all([
      authorIds.length
        ? supabase.from("profiles").select("id, full_name, first_name, last_name").in("id", authorIds)
        : Promise.resolve({ data: [] as any[] }),
      eventIds.length
        ? supabase
            .from("events")
            .select("id, title, starts_at, type, opponent")
            .in("id", eventIds as string[])
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const authorById = new Map((authorsRes.data ?? []).map((a: any) => [a.id, a]));
    const eventById = new Map((eventsRes.data ?? []).map((e: any) => [e.id, e]));

    return {
      feedback: (rows ?? []).map((r: any) => ({
        ...r,
        author: authorById.get(r.author_user_id) ?? null,
        event: r.event_id ? eventById.get(r.event_id) ?? null : null,
      })),
    };
  });

// ------------------------------------------------------------------
// Create
// ------------------------------------------------------------------
export const createPlayerFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Look up player → club_id, team_id (event's team if provided)
    const { data: player, error: pErr } = await supabase
      .from("players")
      .select("id, club_id")
      .eq("id", data.playerId)
      .maybeSingle();
    if (pErr || !player) throw new Response("Player not found", { status: 404 });

    const { data: row, error } = await supabase
      .rpc("save_player_feedback" as any, {
        _id: null,
        _player_id: data.playerId,
        _event_id: data.eventId ?? null,
        _rating: data.rating ?? null,
        _comment: data.comment ?? null,
        _dev_notes: data.devNotes ?? null,
        _strengths: data.strengths ?? null,
        _improvements: data.improvements ?? null,
        _tags: data.tags ?? [],
        _visibility: data.visibility,
        _shared_summary: data.sharedSummary ?? null,
      })
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { id: (row as any).id };
  });

// ------------------------------------------------------------------
// Update
// ------------------------------------------------------------------
export const updatePlayerFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    FeedbackInput.partial()
      .extend({ id: z.string().uuid() })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: any = {};
    if (data.rating !== undefined) patch.rating = data.rating;
    if (data.comment !== undefined) patch.comment = data.comment;
    if (data.devNotes !== undefined) patch.dev_notes = data.devNotes;
    if (data.strengths !== undefined) patch.strengths = data.strengths;
    if (data.improvements !== undefined) patch.improvements = data.improvements;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if (data.sharedSummary !== undefined) patch.shared_summary = data.sharedSummary;
    const { data: current, error: currentError } = await supabase
      .from("player_feedback" as any)
      .select("player_id, event_id, rating, comment, dev_notes, strengths, improvements, tags, visibility, shared_summary")
      .eq("id", data.id)
      .maybeSingle();
    if (currentError || !current) throw new Response("Retour introuvable", { status: 404 });

    const { data: row, error } = await supabase
      .rpc("save_player_feedback" as any, {
        _id: data.id,
        _player_id: (current as any).player_id,
        _event_id: (current as any).event_id ?? null,
        _rating: patch.rating ?? (current as any).rating ?? null,
        _comment: patch.comment ?? (current as any).comment ?? null,
        _dev_notes: patch.dev_notes ?? (current as any).dev_notes ?? null,
        _strengths: patch.strengths ?? (current as any).strengths ?? null,
        _improvements: patch.improvements ?? (current as any).improvements ?? null,
        _tags: patch.tags ?? (current as any).tags ?? [],
        _visibility: patch.visibility ?? (current as any).visibility ?? "coach_only",
        _shared_summary: patch.shared_summary ?? (current as any).shared_summary ?? null,
      })
      .single();
    if (error) throw new Response(error.message, { status: 400 });
    return { id: (row as any).id, ok: true };
  });

// ------------------------------------------------------------------
// Soft delete
// ------------------------------------------------------------------
export const deletePlayerFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("player_feedback" as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// ------------------------------------------------------------------
// List players convoked to an event (for the post-match feedback form)
// ------------------------------------------------------------------
export const listEventPlayersForFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { eventId: string }) =>
    z.object({ eventId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: event } = await supabase
      .from("events")
      .select("id, title, starts_at, type, team_id, opponent, team:team_id(sport)")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!event) throw new Response("Event not found", { status: 404 });
    const sport = (event as any)?.team?.sport ?? null;

    const { data: convs } = await supabase
      .from("convocations")
      .select(
        "id, status, player:player_id(id, first_name, last_name, photo_url, jersey_number)"
      )
      .eq("event_id", data.eventId);

    const players = (convs ?? [])
      .map((c: any) => ({
        convocation_id: c.id,
        attendance: c.status as string,
        player: c.player,
      }))
      .filter((c) => !!c.player)
      .sort((a, b) => {
        const orderA = a.attendance === "present" ? 0 : a.attendance === "uncertain" ? 1 : 2;
        const orderB = b.attendance === "present" ? 0 : b.attendance === "uncertain" ? 1 : 2;
        if (orderA !== orderB) return orderA - orderB;
        return (a.player.last_name ?? "").localeCompare(b.player.last_name ?? "");
      });

    // Existing feedback by current user for these players on this event
    const playerIds = players.map((p) => p.player.id);
    let existing: Record<string, any> = {};
    if (playerIds.length) {
      const { data: rows } = await supabase
        .from("player_feedback" as any)
        .select("id, player_id, rating, comment, dev_notes, strengths, improvements, tags, visibility, shared_summary")
        .eq("event_id", data.eventId)
        .eq("author_user_id", context.userId)
        .is("deleted_at", null)
        .in("player_id", playerIds);
      for (const r of rows ?? []) existing[(r as any).player_id] = r;
    }

    return { event, players, existing, sport };
  });

// ------------------------------------------------------------------
// List AI reviews
// ------------------------------------------------------------------
export const listPlayerReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { playerId: string }) =>
    z.object({ playerId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaffCanViewPlayerFeedback(supabase, userId, data.playerId);
    const { data: rows, error } = await supabase
      .from("player_reviews" as any)
      .select("id, kind, period_start, period_end, content, visibility, model, created_at, author_user_id")
      .eq("player_id", data.playerId)
      .order("created_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 500 });
    return { reviews: rows ?? [] };
  });

// ------------------------------------------------------------------
// Generate an AI review
// ------------------------------------------------------------------
export const generatePlayerReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        playerId: z.string().uuid(),
        kind: ReviewKind,
        periodStart: z.string().nullish(),
        periodEnd: z.string().nullish(),
        visibility: FeedbackVisibility.default("coach_only"),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Response("AI not configured", { status: 500 });

    // Load player
    const { data: player } = await supabase
      .from("players")
      .select("id, club_id, first_name, last_name, preferred_position, birth_date")
      .eq("id", data.playerId)
      .maybeSingle();
    if (!player) throw new Response("Player not found", { status: 404 });

    // Author must be coach/admin of club
    const { data: canAuthor } = await supabase.rpc("can_author_player_feedback" as any, {
      _user_id: userId,
      _player_id: data.playerId,
    });
    if (!canAuthor) throw new Response("Forbidden", { status: 403 });

    // Load feedbacks visible to the coach (uses RLS)
    const { data: feedbacks } = await supabase
      .from("player_feedback" as any)
      .select(
        "rating, comment, dev_notes, strengths, improvements, tags, created_at, event:event_id(title, starts_at, type, opponent)"
      )
      .eq("player_id", data.playerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    // Attendance summary
    const { data: convs } = await supabase
      .from("convocations")
      .select("status, event:event_id(type, status, starts_at)")
      .eq("player_id", data.playerId);
    const att = { present: 0, absent: 0, uncertain: 0, pending: 0, total: 0 };
    const now = Date.now();
    for (const c of convs ?? []) {
      const ev: any = (c as any).event;
      if (!ev || ev.status !== "published") continue;
      if (new Date(ev.starts_at).getTime() > now) continue;
      att.total++;
      if (c.status === "present") att.present++;
      else if (c.status === "absent") att.absent++;
      else if (c.status === "uncertain") att.uncertain++;
      else att.pending++;
    }

    // Goals & assists
    const [{ data: goalsScored }, { data: assists }] = await Promise.all([
      supabase
        .from("event_goals")
        .select("kind, created_at")
        .eq("scorer_player_id", data.playerId),
      supabase
        .from("event_goals")
        .select("created_at")
        .eq("assist_player_id", data.playerId),
    ]);

    const stats = {
      attendance: att,
      attendance_rate:
        att.total > 0 ? Math.round((att.present / att.total) * 100) : null,
      goals: (goalsScored ?? []).filter((g: any) => g.kind === "goal").length,
      own_goals: (goalsScored ?? []).filter((g: any) => g.kind === "own_goal").length,
      assists: (assists ?? []).length,
    };

    const KIND_LABEL: Record<string, string> = {
      end_of_season: "Bilan de fin de saison",
      meeting: "Préparation d'entretien individuel",
      development: "Rapport de développement",
      coaching: "Synthèse pour le staff coaching",
    };

    const prompt = `Tu es un coach sportif bienveillant et professionnel. Rédige une synthèse en français pour le joueur "${player.first_name} ${player.last_name}".

Type de document : ${KIND_LABEL[data.kind]}
${data.periodStart || data.periodEnd ? `Période : ${data.periodStart ?? "—"} → ${data.periodEnd ?? "—"}` : ""}

Données disponibles :
- Poste préféré : ${player.preferred_position ?? "non précisé"}
- Présence (entraînements + matchs publiés et passés) : ${JSON.stringify(stats.attendance)} (taux de présence ${stats.attendance_rate ?? "n/a"}%)
- Statistiques offensives : ${stats.goals} but(s), ${stats.assists} passe(s) décisive(s), ${stats.own_goals} CSC
- Retours coachs récents (${(feedbacks ?? []).length}) : ${JSON.stringify(feedbacks ?? [])}

Consignes de rédaction :
- Ton constructif, axé développement, jamais humiliant ni jugement définitif.
- Identifie des forces récurrentes et des axes de progrès concrets.
- Suggère 2-3 pistes de travail réalistes.
- Mets en avant la progression observée si possible.
- Évite les classements, notes chiffrées agressives ou comparaisons défavorables.
- Format Markdown avec sections : **Forces**, **Axes de progrès**, **Recommandations**, **Synthèse**.
- 250 à 400 mots. Pas d'introduction sur "voici la synthèse".`;

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    let content: string;
    try {
      const { text } = await generateText({ model, prompt });
      content = text;
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (msg.includes("429")) throw new Response("rate_limited", { status: 429 });
      if (msg.includes("402")) throw new Response("credits_exhausted", { status: 402 });
      throw new Response("AI generation failed", { status: 500 });
    }

    // Persist
    const { data: row, error } = await supabase
      .rpc("create_player_review" as any, {
        _player_id: player.id,
        _kind: data.kind,
        _period_start: data.periodStart || null,
        _period_end: data.periodEnd || null,
        _content: content,
        _visibility: data.visibility,
        _model: "google/gemini-3-flash-preview",
      })
      .single();
    if (error) throw new Response(error.message, { status: 500 });
    return { review: row as PlayerReviewRow };
  });

export const deletePlayerReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("player_reviews" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });

// ------------------------------------------------------------------
// Refine an existing AI review with a coach instruction.
// The conversation is stateless: we send the previous content + the
// new instruction back to the model and replace the review in place.
// ------------------------------------------------------------------
export const refinePlayerReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        reviewId: z.string().uuid(),
        instruction: z.string().trim().min(2).max(2000),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Response("AI not configured", { status: 500 });

    const { data: review, error: rErr } = await supabase
      .from("player_reviews" as any)
      .select("id, player_id, kind, content")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (rErr || !review) throw new Response("Review not found", { status: 404 });

    const { data: player } = await supabase
      .from("players")
      .select("first_name, last_name")
      .eq("id", (review as any).player_id)
      .maybeSingle();

    const systemPrompt = `Tu es un coach sportif bienveillant qui affine des synthèses joueurs. Tu DOIS suivre l'instruction du coach à la lettre : nombre exact de phrases, ton, longueur, format et angle demandé. L'instruction prime sur toute structure par défaut : si le coach demande un résumé en 5 phrases, tu renvoies exactement 5 phrases et tu supprimes les sections longues. Tu réponds toujours en français, sans préambule, sans JSON et sans bloc de code.`;

    const userPrompt = `Joueur : ${player?.first_name ?? ""} ${player?.last_name ?? ""}

--- SYNTHÈSE ACTUELLE ---
${(review as any).content}
--- FIN SYNTHÈSE ---

INSTRUCTION DU COACH (priorité absolue) :
"${data.instruction}"

Renvoie uniquement la synthèse COMPLÈTE mise à jour selon l'instruction : pas de diff, pas de commentaire, pas de JSON.`;

    const gateway = createLovableAiGatewayProvider(apiKey);
    const modelNames = ["google/gemini-2.5-flash", "openai/gpt-5-mini"] as const;
    const requestedSentenceCount = getRequestedSentenceCount(data.instruction);

    const previousContent = String((review as any).content ?? "");
    let content = "";
    let changes: string = "";
    let usedModel: string = modelNames[0];
    let lastError = "";
    const sentenceInstruction = requestedSentenceCount
      ? `\n\nIMPORTANT : produis exactement ${requestedSentenceCount} phrases. Ne garde pas les titres de sections si cela empêche de respecter la limite.`
      : "";

    for (const modelName of modelNames) {
      try {
        const { text, finishReason } = await generateText({
          model: gateway(modelName),
          system: systemPrompt,
          prompt: userPrompt + sentenceInstruction + `\n\nRéponds uniquement avec la synthèse complète réécrite.`,
          maxOutputTokens: 8192,
          temperature: 0.2,
        });
        const candidate = cleanReviewContent(text ?? "");
        console.info("[refinePlayerReview] generation result", {
          modelName,
          finishReason,
          textLength: candidate.length,
          requestedSentenceCount,
        });
        if (candidate) {
          content = candidate;
          usedModel = modelName;
          break;
        }
        lastError = `empty_ai_response:${finishReason}`;
      } catch (e: any) {
        const msg: string = e?.message ?? "";
        console.error("[refinePlayerReview] generation failed", { modelName, msg });
        if (msg.includes("429")) throw new Response("rate_limited", { status: 429 });
        if (msg.includes("402")) throw new Response("credits_exhausted", { status: 402 });
        lastError = msg;
      }
    }

    if (!content) {
      const fallback = localInstructionFallback(previousContent, requestedSentenceCount);
      if (!fallback) {
        throw new Response("L'IA a renvoyé une réponse vide. Rien n'a été modifié.", { status: 502 });
      }
      content = fallback;
      usedModel = "local-fallback";
      changes = `L'IA a renvoyé une réponse vide, j'ai appliqué localement la réduction à ${requestedSentenceCount} phrase${requestedSentenceCount && requestedSentenceCount > 1 ? "s" : ""}.`;
      console.warn("[refinePlayerReview] used local fallback", { requestedSentenceCount, lastError });
    }

    if (requestedSentenceCount) {
      content = locallyLimitSentences(content, requestedSentenceCount) || localInstructionFallback(previousContent, requestedSentenceCount) || content;
      const finalSentenceCount = splitSentences(content).length;
      changes ||= `J'ai réduit la synthèse à ${finalSentenceCount} phrase${finalSentenceCount > 1 ? "s" : ""} comme demandé.`;
    } else {
      changes = "J'ai réécrit la synthèse selon ta demande.";
    }

    content = cleanReviewContent(content);
    if (!content) throw new Response("La synthèse générée est vide. Rien n'a été modifié.", { status: 502 });
    if (!hasVisibleDifference(previousContent, content)) {
      changes = "Je n'ai pas détecté de changement visible après traitement ; la synthèse affichée reste identique.";
    }

    const { data: row, error } = await supabase
      .from("player_reviews" as any)
      .update({ content, model: usedModel })
      .eq("id", data.reviewId)
      .select("id, kind, period_start, period_end, content, visibility, model, created_at, author_user_id")
      .maybeSingle();

    if (error) {
      console.error("[refinePlayerReview] update failed", {
        reviewId: data.reviewId,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      throw new Response(`La synthèse a été générée mais n'a pas pu être enregistrée : ${error.message}`, { status: 500 });
    }
    if (!row) {
      console.error("[refinePlayerReview] update returned no row", { reviewId: data.reviewId });
      throw new Response("La synthèse a été générée mais l'enregistrement est introuvable après mise à jour.", { status: 500 });
    }
    return { review: row as unknown as PlayerReviewRow, changes };
  });
