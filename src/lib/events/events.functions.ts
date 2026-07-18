import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildEventPayload, type BuildEventPayloadInput } from "./event-payload";

const CreateEventSchema = z.object({
  teamId: z.string().uuid(),
  type: z.enum(["training", "match", "tournament", "meeting", "other"]),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  locationUrl: z.string().max(2000).nullable().optional(),
  opponent: z.string().max(255).nullable().optional(),
  competitionType: z.enum(["friendly", "championship", "cup"]).nullable().optional(),
  competitionName: z.string().max(255).nullable().optional(),
  championshipId: z.string().uuid().nullable().optional(),
  isHome: z.boolean().nullable().optional(),
  meetingPoint: z.string().max(255).nullable().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().nullable().optional(),
  convocationTime: z.string().nullable().optional(),
  isOfficial: z.boolean().nullable().optional(),
  carpoolEnabled: z.boolean().nullable().optional(),
  seriesId: z.string().uuid().nullable().optional(),
  attachments: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  facilityId: z.string().uuid().nullable().optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

/**
 * Championship rule (existence, same team, same club, is_active on INSERT, snapshot
 * of competition_name) lives ENTIRELY in the DB trigger
 * `enforce_event_championship_trg` — single source of truth for all write paths
 * (this server fn, direct client inserts, imports, series generator, future RPCs).
 *
 * The server functions here only translate the trigger's raw SQL exception into
 * a stable, i18n-friendly error code. They MUST NOT re-implement the rule.
 */
export function translateEventDbError(
  err: {
    message?: string | null;
    code?: string | null;
  } | null,
): string {
  const msg = err?.message ?? "";
  if (msg.includes("championship_required")) return "championship_required";
  if (msg.includes("championship_not_found")) return "championship_not_found";
  if (msg.includes("championship_team_mismatch")) return "championship_team_mismatch";
  if (msg.includes("championship_club_mismatch")) return "championship_club_mismatch";
  if (msg.includes("championship_archived")) return "championship_archived";
  return msg || "db_error";
}

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateEventSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const payload = buildEventPayload(data as BuildEventPayloadInput);

    // Duplicate guard: same team + type + start time.
    const { data: dupes } = await supabase
      .from("events")
      .select("id")
      .eq("team_id", payload.team_id)
      .eq("type", payload.type)
      .eq("starts_at", payload.starts_at)
      .is("deleted_at", null)
      .limit(1);
    if (dupes && dupes.length > 0) {
      throw new Error("duplicate");
    }

    const { data: row, error } = await supabase
      .from("events")
      .insert({
        ...payload,
        status: "published",
        created_by: userId,
        convocations_sent: false,
      } as never)
      .select("id")
      .single();
    if (error || !row) {
      throw new Error(translateEventDbError(error));
    }

    // Journal produit (fire-and-forget, superadmin observability).
    try {
      const [{ supabaseAdmin }, { logActivity }] = await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/observability/log-activity.server"),
      ]);
      const { data: team } = await supabaseAdmin
        .from("teams")
        .select("club_id")
        .eq("id", payload.team_id)
        .maybeSingle();
      void logActivity(supabaseAdmin, {
        clubId: (team?.club_id as string | undefined) ?? null,
        actorUserId: userId,
        category: "event",
        actionType: "event.created",
        resourceType: "event",
        resourceId: row.id as string,
        metadata: { team_id: payload.team_id, type: payload.type },
      });
    } catch {
      /* never block the create */
    }

    return { id: row.id as string };
  });

const UpdateEventSchema = CreateEventSchema.extend({
  id: z.string().uuid(),
});

export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateEventSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...rest } = data;

    const payload = buildEventPayload(rest as BuildEventPayloadInput);

    const { error } = await supabase
      .from("events")
      .update(payload as never)
      .eq("id", id);
    if (error) {
      throw new Error(translateEventDbError(error));
    }

    try {
      const [{ supabaseAdmin }, { logActivity }] = await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("@/lib/observability/log-activity.server"),
      ]);
      const { data: team } = await supabaseAdmin
        .from("teams")
        .select("club_id")
        .eq("id", payload.team_id)
        .maybeSingle();
      void logActivity(supabaseAdmin, {
        clubId: (team?.club_id as string | undefined) ?? null,
        actorUserId: userId,
        category: "event",
        actionType: "event.updated",
        resourceType: "event",
        resourceId: id,
        metadata: { type: payload.type },
      });
    } catch {
      /* never block */
    }

    return { id };
  });
