/**
 * Server functions for club publications (messages + polls).
 *
 * Phase A backend. Thin wrappers over the SQL RPCs defined in the schema
 * migration. RLS + guards live in the database; these fns only orchestrate
 * IO and validate inputs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const AudienceInput = z.discriminatedUnion("audience_type", [
  z.object({ audience_type: z.literal("joueurs_equipe"), team_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("parents_equipe"), team_id: z.string().uuid() }),
  z.object({
    audience_type: z.literal("joueurs_categorie"),
    category_label: z.string().min(1).max(60),
    season_id: z.string().uuid(),
  }),
  z.object({
    audience_type: z.literal("parents_categorie"),
    category_label: z.string().min(1).max(60),
    season_id: z.string().uuid(),
  }),
  z.object({ audience_type: z.literal("joueurs_convoques"), event_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("parents_convoques"), event_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("educateurs") }),
  z.object({ audience_type: z.literal("dirigeants") }),
  z.object({ audience_type: z.literal("groupe_personnalise"), group_id: z.string().uuid() }),
  z.object({ audience_type: z.literal("selection_manuelle") }),
]);

const CreateInput = z.object({
  clubId: z.string().uuid(),
  publicationType: z.enum(["message", "poll"]),
  title: z.string().min(1).max(200),
  content: z.string().max(20000).default(""),
  pollVisibility: z.enum(["staff_visible", "anonymous"]).nullable(),
  publishToWall: z.boolean(),
  sendEmail: z.boolean(),
  emailBody: z.string().max(20000).nullable(),
  closesAt: z.string().datetime().nullable(),
  eventId: z.string().uuid().nullable(),
  audiences: z.array(AudienceInput).min(1),
  manualMemberIds: z.array(z.string().uuid()).default([]),
  pollOptions: z.array(z.string().min(1).max(120)).default([]),
  documentIds: z.array(z.string().uuid()).default([]),
  mediaPaths: z.array(z.string().min(1)).default([]),
});

// ---------------------------------------------------------------------------
// createPublication — persists all rows then calls publish_publication_atomic
// ---------------------------------------------------------------------------
export const createPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => CreateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Staff check via RLS: insert will fail if not staff — but we assert upfront for a clearer error.
    const { data: staff } = await supabase.rpc("is_club_staff" as any, {
      _user_id: userId,
      _club_id: data.clubId,
    });
    if (!staff) throw new Response("Forbidden", { status: 403 });

    if (data.publicationType === "poll") {
      if (!data.pollVisibility) throw new Response("poll_visibility_required", { status: 400 });
      if (data.pollOptions.length < 2) throw new Response("poll_options_min_2", { status: 400 });
    }
    if (!data.publishToWall && !data.sendEmail) {
      throw new Response("delivery_required", { status: 400 });
    }
    if (!data.publishToWall && !data.sendEmail) {
      throw new Response("delivery_required", { status: 400 });
    }

    // Insert publication
    const { data: pub, error: pubErr } = await supabase
      .from("club_publications")
      .insert({
        club_id: data.clubId,
        author_id: userId,
        publication_type: data.publicationType,
        title: data.title,
        content: data.content,
        poll_visibility: data.publicationType === "poll" ? data.pollVisibility : null,
        publish_to_wall: data.publishToWall,
        send_email: !data.publishToWall ? true : data.sendEmail, // email-only mode forces send_email
        email_body: data.emailBody,
        closes_at: data.closesAt,
        event_id: data.eventId,
      })
      .select("id")
      .single();
    if (pubErr || !pub) {
      console.error("[createPublication] insert failed", pubErr);
      throw new Response("insert_failed", { status: 500 });
    }
    const publicationId = pub.id as string;

    // Audiences
    if (data.audiences.length) {
      const audRows = data.audiences.map((a) => ({
        publication_id: publicationId,
        audience_type: a.audience_type,
        team_id: (a as any).team_id ?? null,
        group_id: (a as any).group_id ?? null,
        category_label: (a as any).category_label ?? null,
        season_id: (a as any).season_id ?? null,
        event_id: (a as any).event_id ?? null,
      }));
      const { error } = await supabase.from("club_publication_audiences").insert(audRows);
      if (error) throw new Response(`audience_insert_failed: ${error.message}`, { status: 500 });
    }
    if (data.manualMemberIds.length) {
      const { error } = await supabase
        .from("club_publication_manual_members")
        .insert(data.manualMemberIds.map((m) => ({ publication_id: publicationId, member_id: m })));
      if (error) throw new Response(`manual_insert_failed: ${error.message}`, { status: 500 });
    }
    if (data.pollOptions.length) {
      const { error } = await supabase.from("club_poll_options").insert(
        data.pollOptions.map((label, i) => ({
          publication_id: publicationId,
          label,
          sort_order: i,
        })),
      );
      if (error) throw new Response(`option_insert_failed: ${error.message}`, { status: 500 });
    }
    if (data.documentIds.length) {
      const { error } = await supabase.from("club_publication_documents").insert(
        data.documentIds.map((document_id, i) => ({
          publication_id: publicationId,
          document_id,
          sort_order: i,
        })),
      );
      if (error) throw new Response(`doc_insert_failed: ${error.message}`, { status: 500 });
    }
    if (data.mediaPaths.length) {
      const { error } = await supabase.from("club_publication_media").insert(
        data.mediaPaths.map((storage_path, i) => ({
          publication_id: publicationId,
          storage_path,
          sort_order: i,
        })),
      );
      if (error) throw new Response(`media_insert_failed: ${error.message}`, { status: 500 });
    }

    // Snapshot recipients + create dispatch row
    const { data: pubRes, error: rpcErr } = await supabase.rpc("publish_publication_atomic" as any, {
      _publication_id: publicationId,
      _kind: "publish",
      _dispatch_id: null,
    });
    if (rpcErr) {
      console.error("[createPublication] publish_atomic failed", rpcErr);
      throw new Response(`publish_failed: ${rpcErr.message}`, { status: 500 });
    }

    const row = Array.isArray(pubRes) ? pubRes[0] : pubRes;
    return {
      publicationId,
      dispatchRowId: row?.dispatch_row_id as string,
      recipientsCount: (row?.recipients_count as number) ?? 0,
    };
  });

// ---------------------------------------------------------------------------
// republishPublication — delta OR full resend
// ---------------------------------------------------------------------------
const RepubInput = z.object({
  publicationId: z.string().uuid(),
  mode: z.enum(["audience_refresh", "manual_resend"]),
});

export const republishPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => RepubInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("publish_publication_atomic" as any, {
      _publication_id: data.publicationId,
      _kind: data.mode,
      _dispatch_id: null,
    });
    if (error) throw new Response(`republish_failed: ${error.message}`, { status: 500 });
    const row = Array.isArray(res) ? res[0] : res;
    return {
      dispatchRowId: row?.dispatch_row_id as string,
      totalRecipients: (row?.recipients_count as number) ?? 0,
      newRecipients: (row?.new_recipient_count as number) ?? 0,
    };
  });

// ---------------------------------------------------------------------------
// castPollVote
// ---------------------------------------------------------------------------
const VoteInput = z.object({
  publicationId: z.string().uuid(),
  optionId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export const castPollVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => VoteInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: voteId, error } = await context.supabase.rpc("cast_poll_vote" as any, {
      _publication_id: data.publicationId,
      _option_id: data.optionId,
      _member_id: data.memberId,
    });
    if (error) {
      // Expose known business errors clearly
      const msg = error.message || "";
      if (msg.includes("poll_closed")) throw new Response("poll_closed", { status: 409 });
      if (msg.includes("forbidden")) throw new Response("Forbidden", { status: 403 });
      throw new Response(`vote_failed: ${msg}`, { status: 500 });
    }
    return { voteId: voteId as string };
  });

// ---------------------------------------------------------------------------
// getPollResults
// ---------------------------------------------------------------------------
export const getPollResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ publicationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_poll_results" as any, {
      _publication_id: data.publicationId,
    });
    if (error) throw new Response(`results_failed: ${error.message}`, { status: 500 });
    return { rows: (rows ?? []) as Array<{
      option_id: string;
      label: string;
      sort_order: number;
      vote_count: number;
      total_voters: number;
      below_threshold: boolean;
      is_anonymous: boolean;
      is_closed: boolean;
    }> };
  });

// ---------------------------------------------------------------------------
// closePublication / deletePublication
// ---------------------------------------------------------------------------
export const closePublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ publicationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("close_publication" as any, {
      _publication_id: data.publicationId,
    });
    if (error) throw new Response(`close_failed: ${error.message}`, { status: 500 });
    return { ok: true };
  });

export const deletePublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ publicationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("soft_delete_publication" as any, {
      _publication_id: data.publicationId,
    });
    if (error) throw new Response(`delete_failed: ${error.message}`, { status: 500 });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// listRecipients — staff-only, distinct members across all dispatches
// ---------------------------------------------------------------------------
export const listPublicationRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ publicationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("club_publication_recipients")
      .select("member_id, created_at, players!inner(id, first_name, last_name)")
      .eq("publication_id", data.publicationId);
    if (error) throw new Response(`list_failed: ${error.message}`, { status: 500 });
    return { recipients: rows ?? [] };
  });
