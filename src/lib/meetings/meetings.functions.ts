/**
 * LOT 1 — Server functions "Présence de réunion".
 * Table dédiée `meeting_attendees`, réservée aux événements type "meeting".
 * Réutilise `resolve_audience_members` et la garde `is_club_staff`.
 * N'affecte PAS le système de convocations joueurs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AudienceSpecSchema } from "@/modules/groups/groups.functions";
import { splitAudiences, type AudienceLike } from "./audience-split";

const SetAttendeesInput = z.object({
  event_id: z.string().uuid(),
  audiences: AudienceSpecSchema.default([]),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = any;

async function loadMeetingClubAsStaff(
  supabase: SupaLike,
  userId: string,
  eventId: string,
): Promise<{ clubId: string; eventType: string; teamId: string | null }> {
  const { data: ev, error } = await supabase
    .from("events")
    .select("id, type, team_id, teams:team_id(club_id)")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = ev as SupaLike;
  if (!row) throw new Error("event_not_found");
  const clubId = (row?.teams?.club_id as string | null) ?? null;
  if (!clubId) throw new Error("meeting_requires_team_linked_event");
  if (row.type !== "meeting") throw new Error("not_a_meeting");

  const { data: isStaff } = await supabase.rpc("is_club_staff", {
    _user_id: userId,
    _club_id: clubId,
  });
  if (!isStaff) throw new Error("forbidden");

  return {
    clubId,
    eventType: row.type as string,
    teamId: (row.team_id as string | null) ?? null,
  };
}

export const setMeetingAttendees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetAttendeesInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await loadMeetingClubAsStaff(supabase as SupaLike, userId, data.event_id);

    const { selectors, manualUserIds } = splitAudiences(
      data.audiences as unknown as AudienceLike[],
      data.manual_user_ids,
    );

    const { data: rpcData, error } = await (supabase as SupaLike).rpc(
      "set_meeting_attendees_atomic",
      {
        _event_id: data.event_id,
        _actor: userId,
        _audiences: selectors,
        _manual_user_ids: manualUserIds,
      },
    );
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

export const previewMeetingAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PreviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { clubId } = await loadMeetingClubAsStaff(supabase as SupaLike, userId, data.event_id);

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

export const listMeetingAttendees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ev } = await supabase
      .from("events")
      .select("id, type, team_id, teams:team_id(club_id)")
      .eq("id", data.event_id)
      .maybeSingle();
    const clubId = ((ev as SupaLike)?.teams?.club_id as string | null) ?? null;
    const { data: isStaff } = clubId
      ? await supabase.rpc("is_club_staff", { _user_id: userId, _club_id: clubId })
      : { data: false };

    if (!isStaff) {
      const { data: mine } = await (supabase as SupaLike)
        .from("meeting_attendees")
        .select("id, event_id, user_id, status, comment, invited_at, responded_at")
        .eq("event_id", data.event_id)
        .eq("user_id", userId)
        .maybeSingle();
      return {
        is_staff: false,
        my_attendance: mine ?? null,
        attendees: [] as MeetingAttendeeRow[],
        counts: { present: 0, absent: 0, uncertain: 0, pending: 0 },
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as SupaLike)
      .from("meeting_attendees")
      .select(
        "id, event_id, user_id, member_id, status, comment, sources, added_manually, invited_at, responded_at",
      )
      .eq("event_id", data.event_id);
    if (error) throw new Error(error.message);

    const attendees = (rows ?? []) as Array<SupaLike>;
    const userIds = Array.from(
      new Set(
        attendees
          .map((a) => a.user_id as string | null)
          .filter((v): v is string => typeof v === "string"),
      ),
    );

    const profileByUser: Record<string, { full_name: string | null; avatar_url: string | null }> =
      {};
    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      for (const p of profs ?? []) {
        const pr = p as SupaLike;
        profileByUser[pr.id] = {
          full_name: (pr.full_name as string | null) ?? null,
          avatar_url: (pr.avatar_url as string | null) ?? null,
        };
      }
    }

    const rolesByUser: Record<string, string[]> = {};
    if (clubId && userIds.length > 0) {
      const { data: cm } = await supabaseAdmin
        .from("club_members")
        .select("user_id, roles, role")
        .eq("club_id", clubId)
        .in("user_id", userIds);
      for (const m of cm ?? []) {
        const mm = m as SupaLike;
        const uid = mm.user_id as string | null;
        if (!uid) continue;
        const uniq = Array.from(
          new Set([...(mm.roles ?? []), ...(mm.role ? [mm.role] : [])].filter(Boolean)),
        ) as string[];
        rolesByUser[uid] = uniq;
      }
    }

    const counts = { present: 0, absent: 0, uncertain: 0, pending: 0 };
    const enriched: MeetingAttendeeRow[] = attendees
      .map((a) => {
        counts[a.status as keyof typeof counts]++;
        const prof = (a.user_id && profileByUser[a.user_id]) || {
          full_name: null,
          avatar_url: null,
        };
        return {
          id: a.id as string,
          user_id: a.user_id as string,
          member_id: (a.member_id as string | null) ?? null,
          status: a.status as MeetingAttendeeRow["status"],
          comment: (a.comment as string | null) ?? null,
          sources: a.sources ?? [],
          added_manually: (a.added_manually as boolean) ?? false,
          invited_at: a.invited_at as string,
          responded_at: (a.responded_at as string | null) ?? null,
          full_name: prof.full_name,
          avatar_url: prof.avatar_url,
          roles: (a.user_id && rolesByUser[a.user_id]) || [],
        };
      })
      .sort((x, y) => (x.full_name ?? "").localeCompare(y.full_name ?? ""));

    return { is_staff: true, my_attendance: null, attendees: enriched, counts };
  });

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
    const clubId = ((ev as SupaLike)?.teams?.club_id as string | null) ?? null;
    const { data: isStaff } = clubId
      ? await supabase.rpc("is_club_staff", { _user_id: userId, _club_id: clubId })
      : { data: false };

    if (!isStaff && data.user_id !== userId) throw new Error("forbidden");

    const patch = {
      status: data.status,
      comment: data.comment ?? null,
      responded_at: new Date().toISOString(),
    };

    if (isStaff) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await (supabaseAdmin as SupaLike)
        .from("meeting_attendees")
        .update(patch)
        .eq("event_id", data.event_id)
        .eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (supabase as SupaLike)
        .from("meeting_attendees")
        .update(patch)
        .eq("event_id", data.event_id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }

    return { ok: true, status: data.status };
  });

export type MeetingAttendeeRow = {
  id: string;
  user_id: string;
  member_id: string | null;
  status: "present" | "absent" | "uncertain" | "pending";
  comment: string | null;
  sources: unknown;
  added_manually: boolean;
  invited_at: string;
  responded_at: string | null;
  full_name: string | null;
  avatar_url: string | null;
  roles: string[];
};
