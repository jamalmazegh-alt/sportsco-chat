/**
 * LOT 1 — Server functions "Présence de réunion".
 *
 * Permet d'inviter des groupes / équipes / personnes à un événement de type
 * "meeting" (éducateurs, CODIR, …) et d'en suivre la présence, en RÉUTILISANT :
 *   - le sélecteur d'audiences existant (`AudienceSelector`, module groups) ;
 *   - le resolver SQL `resolve_audience_members` (dédup par user_id) ;
 *   - la garde `is_club_staff`.
 *
 * IMPORTANT — ne touche PAS au système de convocations joueurs
 * (table `convocations`, réservée aux `players`). La présence réunion vit dans
 * sa propre table `meeting_attendees`, clé canonique = user_id. Aucune
 * régression possible sur les matchs / entraînements.
 *
 * Notifications : hors périmètre LOT 1 (traitées en LOT 2 — notification simple
 * de convocation, comme une convocation d'équipe).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AudienceSpecSchema } from "@/modules/groups/groups.functions";
import { splitAudiences, type AudienceLike } from "./audience-split";

/* ------------------------------------------------------------------------ */
/* Schemas                                                                  */
/* ------------------------------------------------------------------------ */

const SetAttendeesInput = z.object({
  event_id: z.string().uuid(),
  audiences: AudienceSpecSchema.default([]),
  // Personnes ajoutées manuellement (bloc "Pré-assigner des personnes").
  manual_user_ids: z.array(z.string().uuid()).max(500).default([]),
});

const PreviewInput = z.object({
  event_id: z.string().uuid(),
  audiences: AudienceSpecSchema.default([]),
  manual_user_ids: z.array(z.string().uuid()).max(500).default([]),
});

const ListInput = z.object({ event_id: z.string().uuid() });

const UpdateStatusInput = z.object({
  event_id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.enum(["present", "absent", "uncertain", "pending"]),
  comment: z.string().trim().max(1000).nullish(),
});

/* ------------------------------------------------------------------------ */
/* Helpers                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Charge un événement de type "meeting" et résout son club (via l'équipe).
 * Vérifie que l'appelant est staff du club. Lève sinon.
 */
async function loadMeetingClubAsStaff(
  supabase: {
    from: (t: string) => {
      select: (s: string) => {
        eq: (
          c: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> };
      };
    };
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  },
  userId: string,
  eventId: string,
): Promise<{ clubId: string; eventType: string; teamId: string | null }> {
  const { data: ev, error } = await supabase
    .from("events")
    .select("id, type, team_id, teams:team_id(club_id)")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = ev as any;
  if (!row) throw new Error("event_not_found");
  const clubId = (row?.teams?.club_id as string | null) ?? null;
  if (!clubId) throw new Error("meeting_requires_team_linked_event");
  if (row.type !== "meeting") throw new Error("not_a_meeting");

  const { data: isStaff } = await supabase.rpc("is_club_staff", {
    _user_id: userId,
    _club_id: clubId,
  });
  if (!isStaff) throw new Error("forbidden");

  return { clubId, eventType: row.type as string, teamId: (row.team_id as string | null) ?? null };
}

/* ------------------------------------------------------------------------ */
/* 1. setMeetingAttendees — (ré)génère la liste des convoqués (additif)      */
/* ------------------------------------------------------------------------ */

export const setMeetingAttendees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetAttendeesInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Garde tôt (message clair) ; la RPC re-vérifie sous verrou.
    await loadMeetingClubAsStaff(
      supabase as unknown as Parameters<typeof loadMeetingClubAsStaff>[0],
      userId,
      data.event_id,
    );

    const { selectors, manualUserIds } = splitAudiences(
      data.audiences as unknown as AudienceLike[],
      data.manual_user_ids,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error } = await supabase.rpc("set_meeting_attendees_atomic" as any, {
      _event_id: data.event_id,
      _actor: userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _audiences: selectors as any,
      _manual_user_ids: manualUserIds,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
      attendees_count: number;
      inserted_count: number;
      inserted_user_ids: string[] | null;
    } | null;
    if (!row) throw new Error("set_attendees_failed");

    return {
      attendees_count: row.attendees_count,
      inserted_count: row.inserted_count,
      inserted_user_ids: row.inserted_user_ids ?? [],
    };
  });

/* ------------------------------------------------------------------------ */
/* 2. previewMeetingAudience — compte dédupliqué avant validation (staff)    */
/* ------------------------------------------------------------------------ */

export const previewMeetingAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PreviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { clubId } = await loadMeetingClubAsStaff(
      supabase as unknown as Parameters<typeof loadMeetingClubAsStaff>[0],
      userId,
      data.event_id,
    );

    const { selectors, manualUserIds } = splitAudiences(
      data.audiences as unknown as AudienceLike[],
      data.manual_user_ids,
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("resolve_audience_members", {
      _club_id: clubId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _spec: selectors as any,
    });
    if (error) throw new Error(error.message);
    const resolved = new Set<string>(
      ((rows ?? []) as Array<{ user_id: string | null }>)
        .map((r) => r.user_id)
        .filter((v): v is string => typeof v === "string"),
    );
    for (const uid of manualUserIds) resolved.add(uid);
    return { count: resolved.size };
  });

/* ------------------------------------------------------------------------ */
/* 3. listMeetingAttendees — feuille de présence                            */
/*    Staff : liste complète (noms, rôles) + compteurs.                      */
/*    Convoqué : sa propre ligne uniquement (RLS self_select).               */
/* ------------------------------------------------------------------------ */

export const listMeetingAttendees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Résout le club + statut staff (sans exiger meeting ici : lecture large).
    const { data: ev } = await supabase
      .from("events")
      .select("id, type, team_id, teams:team_id(club_id)")
      .eq("id", data.event_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubId = ((ev as any)?.teams?.club_id as string | null) ?? null;
    const { data: isStaff } = clubId
      ? await supabase.rpc("is_club_staff", { _user_id: userId, _club_id: clubId })
      : { data: false };

    // Non-staff : uniquement sa propre ligne (RLS self_select filtre déjà).
    if (!isStaff) {
      const { data: mine } = await supabase
        .from("meeting_attendees")
        .select("id, event_id, user_id, status, comment, invited_at, responded_at")
        .eq("event_id", data.event_id)
        .eq("user_id", userId)
        .maybeSingle();
      return {
        is_staff: false,
        my_attendance: mine ?? null,
        attendees: [],
        counts: { present: 0, absent: 0, uncertain: 0, pending: 0 },
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("meeting_attendees")
      .select(
        "id, event_id, user_id, member_id, status, comment, sources, added_manually, invited_at, responded_at",
      )
      .eq("event_id", data.event_id);
    if (error) throw new Error(error.message);

    const attendees = rows ?? [];
    const userIds = Array.from(
      new Set(attendees.map((a) => a.user_id).filter((v): v is string => typeof v === "string")),
    );

    // Noms + avatars.
    const profileByUser: Record<string, { full_name: string | null; avatar_url: string | null }> =
      {};
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      for (const p of profs ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pr = p as any;
        profileByUser[pr.id] = {
          full_name: (pr.full_name as string | null) ?? null,
          avatar_url: (pr.avatar_url as string | null) ?? null,
        };
      }
    }

    // Rôles club (badge).
    const rolesByUser: Record<string, string[]> = {};
    if (clubId && userIds.length > 0) {
      const { data: cm } = await supabaseAdmin
        .from("club_members")
        .select("user_id, roles, role")
        .eq("club_id", clubId)
        .in("user_id", userIds);
      for (const m of cm ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mm = m as any;
        const uid = mm.user_id as string | null;
        if (!uid) continue;
        const uniq = Array.from(
          new Set([...(mm.roles ?? []), ...(mm.role ? [mm.role] : [])].filter(Boolean)),
        ) as string[];
        rolesByUser[uid] = uniq;
      }
    }

    const counts = { present: 0, absent: 0, uncertain: 0, pending: 0 };
    const enriched = attendees
      .map((a) => {
        counts[a.status as keyof typeof counts]++;
        const prof = (a.user_id && profileByUser[a.user_id]) || {
          full_name: null,
          avatar_url: null,
        };
        return {
          id: a.id,
          user_id: a.user_id,
          member_id: a.member_id,
          status: a.status,
          comment: a.comment ?? null,
          sources: a.sources ?? [],
          added_manually: a.added_manually ?? false,
          invited_at: a.invited_at,
          responded_at: a.responded_at ?? null,
          full_name: prof.full_name,
          avatar_url: prof.avatar_url,
          roles: (a.user_id && rolesByUser[a.user_id]) || [],
        };
      })
      .sort((x, y) => (x.full_name ?? "").localeCompare(y.full_name ?? ""));

    return { is_staff: true, my_attendance: null, attendees: enriched, counts };
  });

/* ------------------------------------------------------------------------ */
/* 4. updateMeetingAttendanceStatus — pointage (staff) ou réponse (self)     */
/* ------------------------------------------------------------------------ */

export const updateMeetingAttendanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ev } = await supabase
      .from("events")
      .select("id, team_id, teams:team_id(club_id)")
      .eq("id", data.event_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubId = ((ev as any)?.teams?.club_id as string | null) ?? null;
    const { data: isStaff } = clubId
      ? await supabase.rpc("is_club_staff", { _user_id: userId, _club_id: clubId })
      : { data: false };

    // Un non-staff ne peut modifier QUE sa propre présence.
    if (!isStaff && data.user_id !== userId) throw new Error("forbidden");

    const patch = {
      status: data.status,
      comment: data.comment ?? null,
      responded_at: new Date().toISOString(),
    };

    // Staff → service_role (pointe n'importe quel convoqué). Self → client
    // (RLS self_update borne à sa propre ligne).
    if (isStaff) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("meeting_attendees")
        .update(patch)
        .eq("event_id", data.event_id)
        .eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("meeting_attendees")
        .update(patch)
        .eq("event_id", data.event_id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }

    return { ok: true, status: data.status };
  });
