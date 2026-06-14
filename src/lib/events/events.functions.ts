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
  isHome: z.boolean().nullable().optional(),
  meetingPoint: z.string().max(255).nullable().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().nullable().optional(),
  convocationTime: z.string().nullable().optional(),
  isOfficial: z.boolean().nullable().optional(),
  carpoolEnabled: z.boolean().nullable().optional(),
  seriesId: z.string().uuid().nullable().optional(),
  attachments: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

/**
 * Shared single-event creation. The wizard and any future caller MUST go through
 * this (never a local insert), so the `events` row is always assembled by
 * `buildEventPayload`.
 */
export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateEventSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const payload = buildEventPayload(data as BuildEventPayloadInput);

    // Duplicate guard: same team + type + start time (mirrors EventFormSheet).
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
    if (error || !row) throw new Error(error?.message ?? "insert-failed");

    return { id: row.id as string };
  });
