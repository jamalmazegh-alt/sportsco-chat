/**
 * Server functions for club camps (stages).
 *
 * - Reads: club members (RLS enforced via `has_club_role_text`).
 * - Writes: admin | dirigeant | coach — assertClubRole in application code,
 *   RLS as defense in depth.
 * - Slug: unique per club; immutable once status leaves 'draft'.
 * - Cover: signed upload to `camp-covers` bucket then patch of cover_image_url.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClubRole, type ClubRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugifyCampTitle, isValidCampSlug } from "@/lib/camps.slug";

const MANAGER_ROLES: ClubRole[] = ["admin", "dirigeant", "coach"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CampStatus = "draft" | "published" | "closed" | "archived";

export interface CampAgeGroup {
  id: string;
  camp_id: string;
  label: string;
  birth_year_min: number | null;
  birth_year_max: number | null;
  sort_order: number;
}

export interface ClubCamp {
  id: string;
  club_id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  venue_id: string | null;
  facility_id: string | null;
  start_date: string;
  end_date: string;
  price: number | null;
  currency: string;
  capacity: number;
  registration_deadline: string | null;
  payment_instructions: string | null;
  document_retention_months: number;
  status: CampStatus;
  created_at: string;
  updated_at: string;
}

export interface ClubCampWithAgeGroups extends ClubCamp {
  age_groups: CampAgeGroup[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureSlugAvailable(
  clubId: string,
  slug: string,
  excludeCampId?: string,
): Promise<void> {
  const q = supabaseAdmin
    .from("club_camps")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("slug", slug);
  const { count, error } = excludeCampId ? await q.neq("id", excludeCampId) : await q;
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) throw new Error("SLUG_TAKEN");
}

async function loadCampForClubCheck(campId: string) {
  const { data, error } = await supabaseAdmin
    .from("club_camps")
    .select("id, club_id, status, slug")
    .eq("id", campId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
  return data;
}

// ---------------------------------------------------------------------------
// List / read
// ---------------------------------------------------------------------------

const ListInput = z.object({
  clubId: z.string().uuid(),
  includeArchived: z.boolean().optional(),
});

export const listClubCamps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<ClubCamp[]> => {
    const q = context.supabase
      .from("club_camps")
      .select(
        "id, club_id, title, slug, description, cover_image_url, venue_id, facility_id, external_location, start_date, end_date, price, currency, capacity, registration_deadline, payment_instructions, document_retention_months, status, created_at, updated_at",
      )
      .eq("club_id", data.clubId)
      .order("start_date", { ascending: false });
    const { data: rows, error } = data.includeArchived
      ? await q
      : await q.neq("status", "archived");
    if (error) throw new Error(error.message);
    return (rows ?? []) as ClubCamp[];
  });

export const getClubCamp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ClubCampWithAgeGroups> => {
    const { data: camp, error } = await context.supabase
      .from("club_camps")
      .select(
        "id, club_id, title, slug, description, cover_image_url, venue_id, facility_id, external_location, start_date, end_date, price, currency, capacity, registration_deadline, payment_instructions, document_retention_months, status, created_at, updated_at",
      )
      .eq("id", data.campId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!camp) throw new Error("NOT_FOUND");
    const { data: ageGroups, error: agErr } = await context.supabase
      .from("club_camp_age_groups")
      .select("id, camp_id, label, birth_year_min, birth_year_max, sort_order")
      .eq("camp_id", data.campId)
      .order("sort_order", { ascending: true });
    if (agErr) throw new Error(agErr.message);
    return {
      ...(camp as ClubCamp),
      age_groups: (ageGroups ?? []) as CampAgeGroup[],
    };
  });

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const CreateInput = z.object({
  clubId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  capacity: z.number().int().positive().max(10_000),
});

export const createClubCamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; slug: string }> => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: MANAGER_ROLES,
    });

    // Generate unique slug (base, then -2, -3, …).
    const base = slugifyCampTitle(data.title);
    let slug = base;
    for (let n = 2; n < 100; n++) {
      try {
        await ensureSlugAvailable(data.clubId, slug);
        break;
      } catch (e) {
        if ((e as Error).message !== "SLUG_TAKEN") throw e;
        slug = `${base}-${n}`;
      }
    }

    const { data: created, error } = await supabaseAdmin
      .from("club_camps")
      .insert({
        club_id: data.clubId,
        title: data.title,
        slug,
        start_date: data.startDate,
        end_date: data.endDate,
        capacity: data.capacity,
        status: "draft",
        created_by: context.userId,
      })
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id, slug: created.slug };
  });

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const UpdatePatch = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(2).max(80).optional(),
    description: z.string().max(4000).nullable().optional(),
    venue_id: z.string().uuid().nullable().optional(),
    facility_id: z.string().uuid().nullable().optional(),
    start_date: z.string().min(1).optional(),
    end_date: z.string().min(1).optional(),
    registration_deadline: z.string().nullable().optional(),
    price: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).optional(),
    capacity: z.number().int().positive().max(10_000).optional(),
    payment_instructions: z.string().max(2000).nullable().optional(),
    document_retention_months: z.number().int().min(1).max(120).optional(),
    cover_image_url: z.string().url().nullable().optional(),
  })
  .strict();

const UpdateInput = z.object({
  campId: z.string().uuid(),
  patch: UpdatePatch,
});

export const updateClubCamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const camp = await loadCampForClubCheck(data.campId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: camp.club_id,
      allowedRoles: MANAGER_ROLES,
    });

    const patch = { ...data.patch };

    if (patch.slug !== undefined) {
      const nextSlug = patch.slug;
      if (camp.status !== "draft" && nextSlug !== camp.slug) {
        throw new Error("SLUG_LOCKED");
      }
      if (!isValidCampSlug(nextSlug)) throw new Error("SLUG_INVALID");
      if (nextSlug !== camp.slug) {
        await ensureSlugAvailable(camp.club_id, nextSlug, camp.id);
      }
    }

    if (
      patch.start_date !== undefined &&
      patch.end_date !== undefined &&
      new Date(patch.start_date) > new Date(patch.end_date)
    ) {
      throw new Error("DATES_INVALID");
    }

    const { error } = await supabaseAdmin
      .from("club_camps")
      .update(patch)
      .eq("id", data.campId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function transitionStatus(
  campId: string,
  userId: string,
  supabase: import("@supabase/supabase-js").SupabaseClient,
  next: CampStatus,
): Promise<void> {
  const camp = await loadCampForClubCheck(campId);
  await assertClubRole({
    supabase,
    userId,
    clubId: camp.club_id,
    allowedRoles: MANAGER_ROLES,
  });
  const { error } = await supabaseAdmin
    .from("club_camps")
    .update({ status: next })
    .eq("id", campId);
  if (error) throw new Error(error.message);
}

export const publishClubCamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Validate publish preconditions using admin client to read full row.
    const { data: camp, error } = await supabaseAdmin
      .from("club_camps")
      .select(
        "id, club_id, title, start_date, end_date, capacity, registration_deadline, status",
      )
      .eq("id", data.campId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!camp) throw new Error("NOT_FOUND");

    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: camp.club_id,
      allowedRoles: MANAGER_ROLES,
    });

    if (camp.status !== "draft") throw new Error("NOT_DRAFT");
    if (!camp.title.trim()) throw new Error("PUBLISH_TITLE_REQUIRED");
    if (!camp.start_date || !camp.end_date) throw new Error("PUBLISH_DATES_REQUIRED");
    if (new Date(camp.start_date) >= new Date(camp.end_date)) {
      throw new Error("PUBLISH_DATES_ORDER");
    }
    if (
      camp.registration_deadline &&
      new Date(camp.registration_deadline) > new Date(camp.start_date)
    ) {
      throw new Error("PUBLISH_DEADLINE_AFTER_START");
    }
    if (!camp.capacity || camp.capacity <= 0) throw new Error("PUBLISH_CAPACITY_REQUIRED");

    const { count, error: agErr } = await supabaseAdmin
      .from("club_camp_age_groups")
      .select("id", { head: true, count: "exact" })
      .eq("camp_id", data.campId);
    if (agErr) throw new Error(agErr.message);
    if ((count ?? 0) < 1) throw new Error("PUBLISH_AGE_GROUP_REQUIRED");

    const { error: upErr } = await supabaseAdmin
      .from("club_camps")
      .update({ status: "published" })
      .eq("id", data.campId);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const closeClubCamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await transitionStatus(data.campId, context.userId, context.supabase, "closed");
    return { ok: true as const };
  });

export const archiveClubCamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await transitionStatus(data.campId, context.userId, context.supabase, "archived");
    return { ok: true as const };
  });

export const deleteClubCamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const camp = await loadCampForClubCheck(data.campId);
    if (camp.status !== "draft") throw new Error("DELETE_NOT_DRAFT");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: camp.club_id,
      allowedRoles: MANAGER_ROLES,
    });
    const { error } = await supabaseAdmin.from("club_camps").delete().eq("id", data.campId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Age groups
// ---------------------------------------------------------------------------

const AgeGroupPayload = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(60),
  birth_year_min: z.number().int().min(1900).max(2100).nullable().optional(),
  birth_year_max: z.number().int().min(1900).max(2100).nullable().optional(),
});

export const upsertCampAgeGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid(), group: AgeGroupPayload }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const camp = await loadCampForClubCheck(data.campId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: camp.club_id,
      allowedRoles: MANAGER_ROLES,
    });

    if (data.group.id) {
      const { error } = await supabaseAdmin
        .from("club_camp_age_groups")
        .update({
          label: data.group.label,
          birth_year_min: data.group.birth_year_min ?? null,
          birth_year_max: data.group.birth_year_max ?? null,
        })
        .eq("id", data.group.id)
        .eq("camp_id", data.campId);
      if (error) throw new Error(error.message);
      return { id: data.group.id };
    }

    const { data: maxRow } = await supabaseAdmin
      .from("club_camp_age_groups")
      .select("sort_order")
      .eq("camp_id", data.campId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;

    const { data: created, error } = await supabaseAdmin
      .from("club_camp_age_groups")
      .insert({
        camp_id: data.campId,
        label: data.group.label,
        birth_year_min: data.group.birth_year_min ?? null,
        birth_year_max: data.group.birth_year_max ?? null,
        sort_order: nextOrder,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteCampAgeGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: row, error: readErr } = await supabaseAdmin
      .from("club_camp_age_groups")
      .select("id, camp_id, club_camps!inner(club_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("NOT_FOUND");
    const clubId =
      (row as unknown as { club_camps: { club_id: string } | null }).club_camps?.club_id ??
      null;
    if (!clubId) throw new Error("NOT_FOUND");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId,
      allowedRoles: MANAGER_ROLES,
    });
    const { error } = await supabaseAdmin
      .from("club_camp_age_groups")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderCampAgeGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ campId: z.string().uuid(), orderedIds: z.array(z.string().uuid()).min(1) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const camp = await loadCampForClubCheck(data.campId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: camp.club_id,
      allowedRoles: MANAGER_ROLES,
    });
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await supabaseAdmin
        .from("club_camp_age_groups")
        .update({ sort_order: i })
        .eq("id", data.orderedIds[i])
        .eq("camp_id", data.campId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Cover upload
// ---------------------------------------------------------------------------

const ALLOWED_COVER_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_COVER_BYTES = 5 * 1024 * 1024;

const CoverUploadInput = z.object({
  campId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
});

function coverExtension(name: string, ct: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  return "jpg";
}

export const createSignedCampCoverUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CoverUploadInput.parse(input))
  .handler(async ({ data, context }): Promise<{ path: string; token: string }> => {
    if (data.size > MAX_COVER_BYTES) throw new Error("COVER_TOO_LARGE");
    if (!ALLOWED_COVER_MIME.has(data.contentType)) throw new Error("COVER_TYPE_UNSUPPORTED");
    const camp = await loadCampForClubCheck(data.campId);
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: camp.club_id,
      allowedRoles: MANAGER_ROLES,
    });
    const ext = coverExtension(data.fileName, data.contentType);
    const path = `${data.campId}/cover-${Date.now()}-${globalThis.crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("camp-covers")
      .createSignedUploadUrl(path, { upsert: true });
    if (error) throw new Error(error.message);
    return { path: signed.path, token: signed.token };
  });

export const setCampCoverFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid(), path: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ coverUrl: string }> => {
    const camp = await loadCampForClubCheck(data.campId);
    if (!data.path.startsWith(`${data.campId}/`)) throw new Error("COVER_PATH_INVALID");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: camp.club_id,
      allowedRoles: MANAGER_ROLES,
    });
    const { data: pub } = supabaseAdmin.storage.from("camp-covers").getPublicUrl(data.path);
    const { error } = await supabaseAdmin
      .from("club_camps")
      .update({ cover_image_url: pub.publicUrl })
      .eq("id", data.campId);
    if (error) throw new Error(error.message);
    return { coverUrl: pub.publicUrl };
  });
