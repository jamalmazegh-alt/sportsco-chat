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
  z.object({ audience_type: z.literal("staff_equipe"), team_id: z.string().uuid() }),
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

const CreateInput = z
  .object({
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
    audiences: z.array(AudienceInput).default([]),
    manualMemberIds: z.array(z.string().uuid()).default([]),
    pollOptions: z.array(z.string().min(1).max(120)).default([]),
    pollAllowMultiple: z.boolean().default(false),
    documentIds: z.array(z.string().uuid()).default([]),
    mediaPaths: z.array(z.string().min(1)).default([]),
  })
  .refine((d) => d.audiences.length > 0 || d.manualMemberIds.length > 0, {
    message: "audience_required",
    path: ["audiences"],
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

    // Persist the whole publication in a single database transaction. This
    // prevents "ghost" polls where the publication row exists but options,
    // audiences or recipients failed to be created.
    const { data: pubRes, error: rpcErr } = await supabase.rpc("create_publication_atomic" as any, {
      _club_id: data.clubId,
      _publication_type: data.publicationType,
      _title: data.title,
      _content: data.content,
      _poll_visibility: data.publicationType === "poll" ? data.pollVisibility : null,
      _publish_to_wall: data.publishToWall,
      _send_email: data.sendEmail,
      _email_body: data.emailBody,
      _closes_at: data.closesAt,
      _event_id: data.eventId,
      _audiences: data.audiences,
      _manual_member_ids: data.manualMemberIds,
      _poll_options: data.pollOptions,
      _document_ids: data.documentIds,
      _media_paths: data.mediaPaths,
    });
    if (rpcErr) {
      console.error("[createPublication] create_publication_atomic failed", rpcErr);
      throw new Response(`publish_failed: ${rpcErr.message}`, { status: 500 });
    }

    const row = Array.isArray(pubRes) ? pubRes[0] : pubRes;
    const publicationId = row?.publication_id as string | undefined;
    const dispatchRowId = row?.dispatch_row_id as string;

    if (!publicationId) {
      console.error(
        "[createPublication] create_publication_atomic returned no publication id",
        row,
      );
      throw new Response("publish_failed", { status: 500 });
    }

    // Sondage à réponses multiples (réglage post-création, staff only côté SQL)
    if (data.publicationType === "poll" && data.pollAllowMultiple) {
      const { error: multiErr } = await supabase.rpc("set_poll_allow_multiple" as any, {
        _publication_id: publicationId,
        _allow: true,
      });
      if (multiErr) {
        console.error("[createPublication] set_poll_allow_multiple failed", multiErr);
      }
    }

    // Best-effort : e-mail interactif de sondage
    if (data.publicationType === "poll" && data.sendEmail && dispatchRowId) {
      try {
        const { dispatchPollEmails } = await import("./publications.notify.server");
        await dispatchPollEmails(publicationId, dispatchRowId, "publish");
      } catch (e) {
        console.error("[createPublication] dispatchPollEmails failed", e);
      }
    }

    // Best-effort : notification push (même règle que les posts du mur)
    if (data.publishToWall && dispatchRowId) {
      try {
        const { dispatchPublicationPush } = await import("./publications.push.server");
        await dispatchPublicationPush(publicationId, dispatchRowId, "publish", {
          excludeUserId: userId,
        });
      } catch (e) {
        console.error("[createPublication] dispatchPublicationPush failed", e);
      }
    }

    return {
      publicationId,
      dispatchRowId,
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
    const dispatchRowId = row?.dispatch_row_id as string;

    // Best-effort : e-mail interactif de sondage (delta si audience_refresh,
    // tous les destinataires si manual_resend).
    if (dispatchRowId) {
      try {
        const { data: pubMeta } = await context.supabase
          .from("club_publications")
          .select("publication_type, send_email")
          .eq("id", data.publicationId)
          .maybeSingle();
        if (pubMeta?.publication_type === "poll" && pubMeta?.send_email) {
          const { dispatchPollEmails } = await import("./publications.notify.server");
          await dispatchPollEmails(data.publicationId, dispatchRowId, data.mode);
        }
      } catch (e) {
        console.error("[republishPublication] dispatchPollEmails failed", e);
      }
    }

    // Best-effort : push aux nouveaux destinataires (ou à tous en manual_resend)
    if (dispatchRowId) {
      try {
        const { dispatchPublicationPush } = await import("./publications.push.server");
        await dispatchPublicationPush(data.publicationId, dispatchRowId, data.mode, {
          excludeUserId: context.userId,
        });
      } catch (e) {
        console.error("[republishPublication] dispatchPublicationPush failed", e);
      }
    }

    return {
      dispatchRowId,
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
  subjectKind: z.enum(["player", "user"]),
  subjectId: z.string().uuid(),
});

export const castPollVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => VoteInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: voteId, error } = await context.supabase.rpc("cast_poll_vote" as any, {
      _publication_id: data.publicationId,
      _option_id: data.optionId,
      _subject_kind: data.subjectKind,
      _subject_id: data.subjectId,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("poll_closed")) throw new Response("poll_closed", { status: 409 });
      if (msg.includes("forbidden")) throw new Response("Forbidden", { status: 403 });
      if (msg.includes("invalid_subject_kind"))
        throw new Response("invalid_subject_kind", { status: 400 });
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
    return {
      rows: (rows ?? []) as Array<{
        option_id: string;
        label: string;
        sort_order: number;
        vote_count: number;
        total_voters: number;
        below_threshold: boolean;
        is_anonymous: boolean;
        is_closed: boolean;
      }>,
    };
  });

// ---------------------------------------------------------------------------
// getPollVoters — staff only, only for polls created with nominative results
// ---------------------------------------------------------------------------
export const getPollVoters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ publicationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_poll_voters" as any, {
      _publication_id: data.publicationId,
    });
    if (error) {
      // Anonymous poll or non-staff caller: no voter detail, not a hard error.
      if (/poll_is_anonymous|forbidden/.test(error.message)) return { rows: [] };
      throw new Response(`voters_failed: ${error.message}`, { status: 500 });
    }
    return {
      rows: (rows ?? []) as Array<{
        option_id: string;
        option_label: string;
        sort_order: number;
        voter_name: string;
        subject_name: string;
        subject_kind: string;
        voted_at: string;
      }>,
    };
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
      .select(
        "subject_kind, member_id, subject_user_id, created_at, players(id, first_name, last_name)",
      )
      .eq("publication_id", data.publicationId);
    if (error) throw new Response(`list_failed: ${error.message}`, { status: 500 });
    return { recipients: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// previewPublicationAudience — dry-run the resolver, returns distinct user count
// ---------------------------------------------------------------------------
const PreviewInput = z.object({
  clubId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  audiences: z.array(AudienceInput).default([]),
  manualMemberIds: z.array(z.string().uuid()).default([]),
});

export const previewPublicationAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => PreviewInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: staff } = await supabase.rpc("is_club_staff" as any, {
      _user_id: userId,
      _club_id: data.clubId,
    });
    if (!staff) throw new Response("Forbidden", { status: 403 });

    const { data: res, error } = await supabase.rpc("preview_publication_audience" as any, {
      _club_id: data.clubId,
      _event_id: data.eventId,
      _audiences: data.audiences as any,
      _manual_member_ids: data.manualMemberIds,
    });
    if (error) throw new Response(`preview_failed: ${error.message}`, { status: 500 });
    const row = Array.isArray(res) ? res[0] : res;
    return {
      count: (row?.count as number) ?? 0,
      playerCount: (row?.player_count as number) ?? 0,
      userCount: (row?.user_count as number) ?? 0,
    };
  });

// ---------------------------------------------------------------------------
// listPublications — feed for the current user in a club (wall only)
// ---------------------------------------------------------------------------
export const listPublications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({ clubId: z.string().uuid(), limit: z.number().min(1).max(100).default(50) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("club_publications")
      .select(
        "id, club_id, author_id, publication_type, title, content, poll_visibility, publish_to_wall, send_email, published_at, closes_at, closed_at, event_id, deleted_at",
      )
      .eq("club_id", data.clubId)
      .eq("publish_to_wall", true)
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Response(`list_failed: ${error.message}`, { status: 500 });
    const list = rows ?? [];
    if (list.length === 0) return { publications: list };

    // Attach audiences so the wall can show scope badges (e.g. "Staff <team>")
    // and filter polls in the team-staff wall view. RLS on
    // club_publication_audiences mirrors publications visibility.
    const ids = list.map((p) => p.id);
    const { data: auds } = await context.supabase
      .from("club_publication_audiences")
      .select("publication_id, audience_type, team_id, group_id, category_label, event_id")
      .in("publication_id", ids);
    const byPub = new Map<string, any[]>();
    for (const a of (auds ?? []) as any[]) {
      const arr = byPub.get(a.publication_id) ?? [];
      arr.push(a);
      byPub.set(a.publication_id, arr);
    }
    return {
      publications: list.map((p) => ({ ...p, audiences: byPub.get(p.id) ?? [] })),
    };
  });

// ---------------------------------------------------------------------------
// getPublication — single publication with options + own vote
// ---------------------------------------------------------------------------
export const getPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ publicationId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: pub, error: pubErr } = await supabase
      .from("club_publications")
      .select(
        "id, club_id, author_id, publication_type, title, content, poll_visibility, poll_allow_multiple, publish_to_wall, send_email, email_body, published_at, closes_at, closed_at, event_id, deleted_at",
      )
      .eq("id", data.publicationId)
      .maybeSingle();
    if (pubErr) throw new Response(`get_failed: ${pubErr.message}`, { status: 500 });
    if (!pub) throw new Response("not_found", { status: 404 });

    const [
      { data: opts },
      { data: eligible, error: eligibleErr },
      { data: staff },
      { data: auds },
    ] = await Promise.all([
      supabase
        .from("club_poll_options")
        .select("id, label, sort_order")
        .eq("publication_id", data.publicationId)
        .order("sort_order", { ascending: true }),
      supabase.rpc("get_eligible_vote_subjects" as any, { _publication_id: data.publicationId }),
      supabase.rpc("is_club_staff" as any, { _user_id: userId, _club_id: pub.club_id }),
      supabase
        .from("club_publication_audiences")
        .select("audience_type, team_id, group_id, category_label, event_id")
        .eq("publication_id", data.publicationId),
    ]);
    if (eligibleErr) throw new Response(`eligible_failed: ${eligibleErr.message}`, { status: 500 });

    const eligibleSubjects = (
      (eligible ?? []) as Array<{
        subject_kind: string;
        subject_id: string;
        relation: string;
        label: string | null;
        current_option_id: string | null;
        current_option_ids: string[] | null;
      }>
    ).map((r) => ({
      subjectKind: r.subject_kind as "user" | "player",
      subjectId: r.subject_id,
      relation: r.relation as "self" | "guardian",
      label: r.label,
      currentOptionId: r.current_option_id,
      currentOptionIds: r.current_option_ids ?? (r.current_option_id ? [r.current_option_id] : []),
    }));

    const audienceRows = (auds ?? []) as Array<{
      audience_type: string;
      team_id: string | null;
      group_id: string | null;
      category_label: string | null;
      event_id: string | null;
    }>;
    const teamIds = Array.from(
      new Set(audienceRows.map((a) => a.team_id).filter((x): x is string => !!x)),
    );
    const teamNames = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
      for (const tm of (teams ?? []) as { id: string; name: string }[]) {
        teamNames.set(tm.id, tm.name);
      }
    }

    return {
      publication: pub,
      options: opts ?? [],
      eligibleSubjects,
      isStaff: !!staff,
      audiences: audienceRows.map((a) => ({
        ...a,
        team_name: a.team_id ? (teamNames.get(a.team_id) ?? null) : null,
      })),
    };
  });
