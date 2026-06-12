import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateOccurrences,
  type SeriesSlotInput,
  type ExcludedRange,
} from "./training-series-generator";

const SlotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  meeting_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().max(255).nullable().optional(),
});

const CreateInputSchema = z.object({
  teamId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isOfficial: z.boolean().default(true),
  slots: z.array(SlotSchema).min(1).max(14),
  excludedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).default([]),
  excludedRanges: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .max(50)
    .default([]),
});

export type CreateTrainingSeriesInput = z.infer<typeof CreateInputSchema>;

export const createTrainingSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Compute occurrences (apply both single excluded dates AND ranges)
    const occurrences = generateOccurrences({
      startsOn: data.startsOn,
      endsOn: data.endsOn,
      slots: data.slots as SeriesSlotInput[],
      excludedDates: data.excludedDates,
      excludedRanges: data.excludedRanges as ExcludedRange[],
      defaultLocation: data.location ?? null,
    });

    if (occurrences.length === 0) {
      throw new Error("No occurrences would be generated");
    }
    if (occurrences.length > 500) {
      throw new Error("Too many occurrences (max 500)");
    }

    // Insert series
    const { data: series, error: sErr } = await supabase
      .from("training_series")
      .insert({
        team_id: data.teamId,
        created_by: userId,
        title: data.title,
        description: data.description ?? null,
        location: data.location ?? null,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        is_official: data.isOfficial,
        excluded_dates: data.excludedDates,
      })
      .select("id")
      .single();
    if (sErr || !series) throw new Error(sErr?.message ?? "Failed to create series");

    // Insert slots
    const slotsPayload = data.slots.map((s, i) => ({
      series_id: series.id,
      weekday: s.weekday,
      meeting_time: s.meeting_time ?? null,
      start_time: s.start_time,
      end_time: s.end_time,
      location: s.location ?? null,
      position: i,
    }));
    const { data: insertedSlots, error: slErr } = await supabase
      .from("training_series_slots")
      .insert(slotsPayload)
      .select("id, position");
    if (slErr || !insertedSlots) throw new Error(slErr?.message ?? "Failed to insert slots");
    const slotIdByPosition = new Map(insertedSlots.map((s) => [s.position, s.id]));

    // Check existing conflicts (same team, same starts_at)
    const startISOs = occurrences.map((o) => o.startISO);
    const { data: existing } = await supabase
      .from("events")
      .select("starts_at")
      .eq("team_id", data.teamId)
      .in("starts_at", startISOs)
      .is("deleted_at", null);
    const conflictSet = new Set((existing ?? []).map((e) => new Date(e.starts_at).toISOString()));

    const eventsPayload = occurrences
      .filter((o) => !conflictSet.has(o.startISO))
      .map((o) => ({
        team_id: data.teamId,
        type: "training" as const,
        title: data.title,
        description: data.description ?? null,
        location: o.location,
        starts_at: o.startISO,
        ends_at: o.endISO,
        convocation_time: o.meetingISO,
        status: "published" as const,
        created_by: userId,
        is_official: data.isOfficial,
        series_id: series.id,
        series_slot_id: slotIdByPosition.get(o.slotIndex) ?? null,
        convocations_sent: false,
      }));

    let createdCount = 0;
    if (eventsPayload.length > 0) {
      const { data: inserted, error: eErr } = await supabase
        .from("events")
        .insert(eventsPayload)
        .select("id");
      if (eErr) throw new Error(eErr.message);
      createdCount = inserted?.length ?? 0;
    }

    return {
      seriesId: series.id,
      createdCount,
      skippedConflicts: conflictSet.size,
      totalPlanned: occurrences.length,
    };
  });

// Delete scope: single | future | all
const DeleteInputSchema = z.object({
  eventId: z.string().uuid(),
  scope: z.enum(["single", "future", "all"]),
});

export const deleteSeriesOccurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ev, error: e1 } = await supabase
      .from("events")
      .select("id, series_id, starts_at")
      .eq("id", data.eventId)
      .single();
    if (e1 || !ev) throw new Error("Event not found");
    if (data.scope === "single" || !ev.series_id) {
      const { error } = await supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", ev.id);
      if (error) throw new Error(error.message);
      return { deletedCount: 1 };
    }
    let q = supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("series_id", ev.series_id).is("deleted_at", null);
    if (data.scope === "future") q = q.gte("starts_at", ev.starts_at);
    const { data: rows, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { deletedCount: rows?.length ?? 0 };
  });

// Update scope for simple field patch (title/location/description)
const UpdatePatchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  is_official: z.boolean().optional(),
});

const UpdateInputSchema = z.object({
  eventId: z.string().uuid(),
  scope: z.enum(["single", "future", "all"]),
  patch: UpdatePatchSchema,
});

export const updateSeriesOccurrence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ev, error: e1 } = await supabase
      .from("events")
      .select("id, series_id, starts_at")
      .eq("id", data.eventId)
      .single();
    if (e1 || !ev) throw new Error("Event not found");

    if (data.scope === "single" || !ev.series_id) {
      const { error } = await supabase
        .from("events")
        .update({ ...data.patch, series_detached: true })
        .eq("id", ev.id);
      if (error) throw new Error(error.message);
      return { updatedCount: 1 };
    }

    let q = supabase.from("events").update(data.patch).eq("series_id", ev.series_id).is("deleted_at", null);
    if (data.scope === "future") q = q.gte("starts_at", ev.starts_at);
    const { data: rows, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { updatedCount: rows?.length ?? 0 };
  });
