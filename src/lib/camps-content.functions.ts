/**
 * Server functions for club camp content authored in Passage 2:
 *  - Program items (sortable timeline)
 *  - Documents fournis (files uploaded by admins, public download)
 *  - Required documents definitions (labels + type + is_sensitive)
 *
 * Reads: club members (RLS `can_manage_club_camp` for authenticated members,
 * `club_camp_is_published` for anon on published camps).
 * Writes: admin | dirigeant | coach — `assertClubRole` in application code,
 * RLS as defense in depth.
 *
 * `is_sensitive` is forced server-side to `true` for medical / health-form
 * document types, regardless of what the client sends. The client-side switch
 * is disabled visually for the same types.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClubRole, type ClubRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MANAGER_ROLES: ClubRole[] = ["admin", "dirigeant", "coach"];

/** Document types that must always be treated as sensitive. */
export const SENSITIVE_DOCUMENT_TYPES = new Set([
  "medical",
  "health_form",
  "certificat_medical",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampProgramItem {
  id: string;
  camp_id: string;
  starts_at: string | null;
  ends_at: string | null;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface CampDocument {
  id: string;
  camp_id: string;
  title: string;
  file_url: string;
  document_type: string | null;
  sort_order: number;
}

export interface CampRequiredDocument {
  id: string;
  camp_id: string;
  title: string;
  required: boolean;
  document_type: string | null;
  is_sensitive: boolean;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loadCampForClubCheck(campId: string) {
  const { data, error } = await supabaseAdmin
    .from("club_camps")
    .select("id, club_id, status")
    .eq("id", campId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
  return data;
}

async function authorizeCampManager(
  campId: string,
  ctx: { supabase: any; userId: string },
) {
  const camp = await loadCampForClubCheck(campId);
  await assertClubRole({
    supabase: ctx.supabase,
    userId: ctx.userId,
    clubId: camp.club_id,
    allowedRoles: MANAGER_ROLES,
  });
  return camp;
}

async function nextSortOrder(
  table: "club_camp_program_items" | "club_camp_documents" | "club_camp_required_documents",
  campId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("sort_order")
    .eq("camp_id", campId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.sort_order ?? -1) + 1;
}

// ---------------------------------------------------------------------------
// Program items
// ---------------------------------------------------------------------------

const ProgramItemPayload = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).nullable().optional(),
    starts_at: z.string().nullable().optional(),
    ends_at: z.string().nullable().optional(),
  })
  .strict();

export const listCampProgramItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CampProgramItem[]> => {
    const { data: rows, error } = await context.supabase
      .from("club_camp_program_items")
      .select("id, camp_id, starts_at, ends_at, title, description, sort_order")
      .eq("camp_id", data.campId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CampProgramItem[];
  });

export const upsertCampProgramItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ campId: z.string().uuid(), item: ProgramItemPayload })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await authorizeCampManager(data.campId, context);
    if (data.item.id) {
      const { error } = await supabaseAdmin
        .from("club_camp_program_items")
        .update({
          title: data.item.title,
          description: data.item.description ?? null,
          starts_at: data.item.starts_at ?? null,
          ends_at: data.item.ends_at ?? null,
        })
        .eq("id", data.item.id)
        .eq("camp_id", data.campId);
      if (error) throw new Error(error.message);
      return { id: data.item.id };
    }
    const sort = await nextSortOrder("club_camp_program_items", data.campId);
    const { data: row, error } = await supabaseAdmin
      .from("club_camp_program_items")
      .insert({
        camp_id: data.campId,
        title: data.item.title,
        description: data.item.description ?? null,
        starts_at: data.item.starts_at ?? null,
        ends_at: data.item.ends_at ?? null,
        sort_order: sort,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteCampProgramItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await authorizeCampManager(data.campId, context);
    const { error } = await supabaseAdmin
      .from("club_camp_program_items")
      .delete()
      .eq("id", data.id)
      .eq("camp_id", data.campId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderCampProgramItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ campId: z.string().uuid(), orderedIds: z.array(z.string().uuid()) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await authorizeCampManager(data.campId, context);
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await supabaseAdmin
        .from("club_camp_program_items")
        .update({ sort_order: i })
        .eq("id", data.orderedIds[i])
        .eq("camp_id", data.campId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Documents fournis (admin-uploaded)
// ---------------------------------------------------------------------------

const ALLOWED_DOC_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_DOC_BYTES = 15 * 1024 * 1024;
const DOC_BUCKET = "attachments";

function docExtension(name: string, ct: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf", "jpg", "jpeg", "png"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }
  if (ct === "application/pdf") return "pdf";
  if (ct === "image/png") return "png";
  return "jpg";
}

export const listCampDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CampDocument[]> => {
    const { data: rows, error } = await context.supabase
      .from("club_camp_documents")
      .select("id, camp_id, title, file_url, document_type, sort_order")
      .eq("camp_id", data.campId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CampDocument[];
  });

export const createSignedCampDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        contentType: z.string().min(1).max(100),
        size: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ path: string; token: string }> => {
    if (data.size > MAX_DOC_BYTES) throw new Error("DOC_TOO_LARGE");
    if (!ALLOWED_DOC_MIME.has(data.contentType)) throw new Error("DOC_TYPE_UNSUPPORTED");
    await authorizeCampManager(data.campId, context);
    const ext = docExtension(data.fileName, data.contentType);
    const path = `camps/${data.campId}/documents/${Date.now()}-${globalThis.crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from(DOC_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw new Error(error.message);
    return { path: signed.path, token: signed.token };
  });

export const addCampDocumentFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        campId: z.string().uuid(),
        path: z.string().min(1).max(500),
        title: z.string().trim().min(1).max(200),
        documentType: z.string().trim().max(60).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CampDocument> => {
    await authorizeCampManager(data.campId, context);
    if (!data.path.startsWith(`camps/${data.campId}/documents/`)) {
      throw new Error("DOC_PATH_INVALID");
    }
    const { data: pub } = supabaseAdmin.storage.from(DOC_BUCKET).getPublicUrl(data.path);
    const sort = await nextSortOrder("club_camp_documents", data.campId);
    const { data: row, error } = await supabaseAdmin
      .from("club_camp_documents")
      .insert({
        camp_id: data.campId,
        title: data.title,
        file_url: pub.publicUrl,
        document_type: data.documentType ?? null,
        sort_order: sort,
      })
      .select("id, camp_id, title, file_url, document_type, sort_order")
      .single();
    if (error) throw new Error(error.message);
    return row as CampDocument;
  });

export const deleteCampDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await authorizeCampManager(data.campId, context);
    // Best-effort remove of the stored object (title stored separately, path
    // recoverable from file_url).
    const { data: existing } = await supabaseAdmin
      .from("club_camp_documents")
      .select("file_url")
      .eq("id", data.id)
      .eq("camp_id", data.campId)
      .maybeSingle();
    const url = existing?.file_url ?? "";
    const marker = `/${DOC_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const path = url.slice(idx + marker.length);
      await supabaseAdmin.storage.from(DOC_BUCKET).remove([path]).catch(() => {});
    }
    const { error } = await supabaseAdmin
      .from("club_camp_documents")
      .delete()
      .eq("id", data.id)
      .eq("camp_id", data.campId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderCampDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ campId: z.string().uuid(), orderedIds: z.array(z.string().uuid()) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await authorizeCampManager(data.campId, context);
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await supabaseAdmin
        .from("club_camp_documents")
        .update({ sort_order: i })
        .eq("id", data.orderedIds[i])
        .eq("camp_id", data.campId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Required documents (labels only — actual uploads land in Phase 2)
// ---------------------------------------------------------------------------

const RequiredDocPayload = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    required: z.boolean().optional().default(true),
    document_type: z.string().trim().max(60).nullable().optional(),
    is_sensitive: z.boolean().optional().default(false),
  })
  .strict();

export const listCampRequiredDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CampRequiredDocument[]> => {
    const { data: rows, error } = await context.supabase
      .from("club_camp_required_documents")
      .select("id, camp_id, title, required, document_type, is_sensitive, sort_order")
      .eq("camp_id", data.campId)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CampRequiredDocument[];
  });

export const upsertCampRequiredDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ campId: z.string().uuid(), doc: RequiredDocPayload })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await authorizeCampManager(data.campId, context);
    const type = (data.doc.document_type ?? "").toLowerCase() || null;
    // Auto-force is_sensitive for medical / health-form documents.
    const isSensitive =
      type && SENSITIVE_DOCUMENT_TYPES.has(type) ? true : !!data.doc.is_sensitive;

    if (data.doc.id) {
      const { error } = await supabaseAdmin
        .from("club_camp_required_documents")
        .update({
          title: data.doc.title,
          required: data.doc.required ?? true,
          document_type: type,
          is_sensitive: isSensitive,
        })
        .eq("id", data.doc.id)
        .eq("camp_id", data.campId);
      if (error) throw new Error(error.message);
      return { id: data.doc.id };
    }
    const sort = await nextSortOrder("club_camp_required_documents", data.campId);
    const { data: row, error } = await supabaseAdmin
      .from("club_camp_required_documents")
      .insert({
        camp_id: data.campId,
        title: data.doc.title,
        required: data.doc.required ?? true,
        document_type: type,
        is_sensitive: isSensitive,
        sort_order: sort,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteCampRequiredDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ campId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await authorizeCampManager(data.campId, context);
    const { error } = await supabaseAdmin
      .from("club_camp_required_documents")
      .delete()
      .eq("id", data.id)
      .eq("camp_id", data.campId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderCampRequiredDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ campId: z.string().uuid(), orderedIds: z.array(z.string().uuid()) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await authorizeCampManager(data.campId, context);
    for (let i = 0; i < data.orderedIds.length; i++) {
      const { error } = await supabaseAdmin
        .from("club_camp_required_documents")
        .update({ sort_order: i })
        .eq("id", data.orderedIds[i])
        .eq("camp_id", data.campId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
