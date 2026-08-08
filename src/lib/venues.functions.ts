/**
 * Server functions for club venues (physical sites) and their facilities
 * (fields / installations).
 *
 * - Read: any club member (RLS-enforced).
 * - Write: club admins only (RLS + assertClubRole defense in depth).
 *
 * The default-uniqueness rules (1 default venue per club, 1 default facility
 * per venue) are enforced in application code — same pattern as seasons.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClubRole } from "@/lib/authz.server";
import { geocodeAddress } from "@/lib/geocode/geocode.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClubFacility {
  id: string;
  venue_id: string;
  name: string;
  surface_type: string | null;
  sport: string | null;
  is_default: boolean;
  display_order: number;
}

export interface ClubVenueWithFacilities {
  id: string;
  club_id: string;
  name: string;
  address: string;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  is_default: boolean;
  display_order: number;
  facilities: ClubFacility[];
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export const listClubVenues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ClubVenueWithFacilities[]> => {
    const { supabase } = context;
    const { data: venues, error } = await supabase
      .from("club_venues")
      .select(
        "id, club_id, name, address, city, postal_code, country, latitude, longitude, notes, is_default, display_order",
      )
      .eq("club_id", data.clubId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const list = venues ?? [];
    if (list.length === 0) return [];
    const ids = list.map((v) => v.id);
    const { data: facilities, error: fErr } = await supabase
      .from("club_facilities")
      .select("id, venue_id, name, surface_type, sport, is_default, display_order")
      .in("venue_id", ids)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (fErr) throw new Error(fErr.message);
    const byVenue = new Map<string, ClubFacility[]>();
    for (const f of facilities ?? []) {
      const arr = byVenue.get(f.venue_id) ?? [];
      arr.push(f as ClubFacility);
      byVenue.set(f.venue_id, arr);
    }
    return list.map((v) => ({ ...v, facilities: byVenue.get(v.id) ?? [] }));
  });

// ---------------------------------------------------------------------------
// Venue CRUD
// ---------------------------------------------------------------------------

const VenueCreate = z.object({
  clubId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const createVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VenueCreate.parse(input))
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    // Coordonnées : celles saisies à la main priment, sinon on géocode
    // l'adresse. Best-effort — un échec laisse le lieu sans coordonnées, ce qui
    // le prive seulement de la météo.
    const coords =
      data.latitude != null && data.longitude != null
        ? { latitude: data.latitude, longitude: data.longitude }
        : ((await geocodeAddress({
            address: data.address,
            city: data.city,
            postalCode: data.postalCode,
            country: data.country,
          })) ?? null);

    const { data: row, error } = await context.supabase
      .from("club_venues")
      .insert({
        club_id: data.clubId,
        name: data.name,
        address: data.address,
        city: data.city ?? null,
        postal_code: data.postalCode ?? null,
        country: data.country ?? null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        notes: data.notes ?? null,
        is_default: data.isDefault ?? false,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "insert_failed");
    if (data.isDefault) {
      await context.supabase
        .from("club_venues")
        .update({ is_default: false })
        .eq("club_id", data.clubId)
        .neq("id", row.id);
    }
    return { id: row.id as string };
  });

const VenueUpdate = VenueCreate.partial({
  name: true,
  address: true,
}).extend({
  venueId: z.string().uuid(),
  clubId: z.string().uuid(),
});

export const updateVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VenueUpdate.parse(input))
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    const patch: {
      name?: string;
      address?: string;
      city?: string | null;
      postal_code?: string | null;
      country?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      notes?: string | null;
      is_default?: boolean;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.address !== undefined) patch.address = data.address;
    if (data.city !== undefined) patch.city = data.city;
    if (data.postalCode !== undefined) patch.postal_code = data.postalCode;
    if (data.country !== undefined) patch.country = data.country;
    if (data.latitude !== undefined) patch.latitude = data.latitude;
    if (data.longitude !== undefined) patch.longitude = data.longitude;

    // L'adresse a changé sans que des coordonnées soient fournies : les
    // anciennes ne valent plus rien, on regéocode. Si ça échoue, on les efface
    // plutôt que de laisser un lieu pointer sur son adresse précédente.
    const addressTouched =
      data.address !== undefined || data.city !== undefined || data.postalCode !== undefined;
    if (addressTouched && data.latitude === undefined && data.longitude === undefined) {
      const { data: current } = await context.supabase
        .from("club_venues")
        .select("address, city, postal_code, country")
        .eq("id", data.venueId)
        .eq("club_id", data.clubId)
        .maybeSingle();
      const address = data.address ?? current?.address ?? "";
      if (address) {
        const geo = await geocodeAddress({
          address,
          city: data.city !== undefined ? data.city : current?.city,
          postalCode: data.postalCode !== undefined ? data.postalCode : current?.postal_code,
          country: data.country !== undefined ? data.country : current?.country,
        });
        patch.latitude = geo?.latitude ?? null;
        patch.longitude = geo?.longitude ?? null;
      }
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.isDefault !== undefined) patch.is_default = data.isDefault;
    const { error } = await context.supabase
      .from("club_venues")
      .update(patch)

      .eq("id", data.venueId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ venueId: z.string().uuid(), clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    const { error } = await context.supabase
      .from("club_venues")
      .delete()
      .eq("id", data.venueId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ venueId: z.string().uuid(), clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    await context.supabase
      .from("club_venues")
      .update({ is_default: false })
      .eq("club_id", data.clubId)
      .eq("is_default", true);
    const { error } = await context.supabase
      .from("club_venues")
      .update({ is_default: true })
      .eq("id", data.venueId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderVenues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ clubId: z.string().uuid(), orderedIds: z.array(z.string().uuid()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await context.supabase
        .from("club_venues")
        .update({ display_order: i })
        .eq("id", data.orderedIds[i])
        .eq("club_id", data.clubId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Facility CRUD — club scope resolved via venue_id
// ---------------------------------------------------------------------------

async function resolveVenueClubId(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  venueId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("club_venues")
    .select("club_id")
    .eq("id", venueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("venue_not_found");
  return data.club_id as string;
}

const FacilityCreate = z.object({
  venueId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  surfaceType: z.string().trim().max(60).nullable().optional(),
  sport: z.string().trim().max(60).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const createFacility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FacilityCreate.parse(input))
  .handler(async ({ data, context }) => {
    const clubId = await resolveVenueClubId(context.supabase, data.venueId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: ["admin"],
    });
    const { data: row, error } = await context.supabase
      .from("club_facilities")
      .insert({
        venue_id: data.venueId,
        name: data.name,
        surface_type: data.surfaceType ?? null,
        sport: data.sport ?? null,
        is_default: data.isDefault ?? false,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "insert_failed");
    if (data.isDefault) {
      await context.supabase
        .from("club_facilities")
        .update({ is_default: false })
        .eq("venue_id", data.venueId)
        .neq("id", row.id);
    }
    return { id: row.id as string };
  });

const FacilityUpdate = z.object({
  facilityId: z.string().uuid(),
  venueId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  surfaceType: z.string().trim().max(60).nullable().optional(),
  sport: z.string().trim().max(60).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export const updateFacility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FacilityUpdate.parse(input))
  .handler(async ({ data, context }) => {
    const clubId = await resolveVenueClubId(context.supabase, data.venueId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: ["admin"],
    });
    const patch: {
      name?: string;
      surface_type?: string | null;
      sport?: string | null;
      is_default?: boolean;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.surfaceType !== undefined) patch.surface_type = data.surfaceType;
    if (data.sport !== undefined) patch.sport = data.sport;
    if (data.isDefault !== undefined) patch.is_default = data.isDefault;

    const { error } = await context.supabase
      .from("club_facilities")
      .update(patch)
      .eq("id", data.facilityId)
      .eq("venue_id", data.venueId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFacility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ facilityId: z.string().uuid(), venueId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const clubId = await resolveVenueClubId(context.supabase, data.venueId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: ["admin"],
    });
    const { error } = await context.supabase
      .from("club_facilities")
      .delete()
      .eq("id", data.facilityId)
      .eq("venue_id", data.venueId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultFacility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ facilityId: z.string().uuid(), venueId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const clubId = await resolveVenueClubId(context.supabase, data.venueId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: ["admin"],
    });
    await context.supabase
      .from("club_facilities")
      .update({ is_default: false })
      .eq("venue_id", data.venueId)
      .eq("is_default", true);
    const { error } = await context.supabase
      .from("club_facilities")
      .update({ is_default: true })
      .eq("id", data.facilityId)
      .eq("venue_id", data.venueId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderFacilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ venueId: z.string().uuid(), orderedIds: z.array(z.string().uuid()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const clubId = await resolveVenueClubId(context.supabase, data.venueId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: ["admin"],
    });
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await context.supabase
        .from("club_facilities")
        .update({ display_order: i })
        .eq("id", data.orderedIds[i])
        .eq("venue_id", data.venueId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Preparation for future anti-double-booking (NOT wired to the create flow).
// Returns events on the same facility overlapping [startsAt, endsAt].
// ---------------------------------------------------------------------------

export const findFacilityConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        facilityId: z.string().uuid(),
        startsAt: z.string().min(1),
        endsAt: z.string().min(1),
        excludeEventId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("events")
      .select("id, title, starts_at")
      .eq("facility_id", data.facilityId)
      .is("deleted_at", null)
      .lt("starts_at", data.endsAt)
      .gt("ends_at", data.startsAt);
    if (data.excludeEventId) q = q.neq("id", data.excludeEventId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; title: string; starts_at: string }[];
  });
