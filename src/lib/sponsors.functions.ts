import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClubRole } from "@/lib/authz.server";

const SIGNED_URL_TTL = 60 * 60; // 1h — regenerated on each fetch
const SPONSOR_LOGOS_BUCKET = "sponsor-logos";

const ALLOWED_LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_LOGO_EXT = new Set(["png", "jpg", "jpeg", "webp"]);
const MAX_LOGO_SIZE = 5 * 1024 * 1024;

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function signLogoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(SPONSOR_LOGOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

// ============================================================================
// Public (member) — home banner
// ============================================================================

export const getActiveSponsorsForHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_active_sponsors_for_home", {
      _club_id: data.clubId,
    });
    if (error) throw new Error(error.message);
    const sponsors = await Promise.all(
      (rows ?? []).map(async (s) => ({
        id: s.id as string,
        name: s.name as string,
        target_url: s.target_url as string,
        logo_url: await signLogoUrl(s.logo_url as string | null),
      })),
    );
    return sponsors;
  });

export const recordSponsorImpression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sponsorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("record_sponsor_impression", {
      p_sponsor_id: data.sponsorId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordSponsorClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sponsorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("record_sponsor_click", {
      p_sponsor_id: data.sponsorId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Admin — CRUD
// ============================================================================

export const listClubSponsors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    const { data: rows, error } = await context.supabase
      .from("sponsors")
      .select("id, name, logo_url, target_url, is_active, created_at, updated_at")
      .eq("club_id", data.clubId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const withUrls = await Promise.all(
      (rows ?? []).map(async (s) => ({
        ...s,
        logo_signed_url: await signLogoUrl(s.logo_url),
      })),
    );
    return withUrls;
  });

const SponsorCreateInput = z.object({
  clubId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  targetUrl: z.string().trim().min(1).max(2048),
  logoPath: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SponsorCreateInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!isSafeHttpUrl(data.targetUrl)) throw new Error("invalid_target_url");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    if (data.logoPath && !data.logoPath.startsWith(`sponsors/${data.clubId}/`)) {
      throw new Error("invalid_logo_path");
    }
    const { data: row, error } = await context.supabase
      .from("sponsors")
      .insert({
        club_id: data.clubId,
        name: data.name,
        target_url: data.targetUrl,
        logo_url: data.logoPath ?? null,
        is_active: data.isActive ?? true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

const SponsorUpdateInput = z.object({
  sponsorId: z.string().uuid(),
  clubId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  targetUrl: z.string().trim().min(1).max(2048).optional(),
  logoPath: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SponsorUpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    if (data.targetUrl !== undefined && !isSafeHttpUrl(data.targetUrl)) {
      throw new Error("invalid_target_url");
    }
    if (data.logoPath && !data.logoPath.startsWith(`sponsors/${data.clubId}/`)) {
      throw new Error("invalid_logo_path");
    }
    const patch: {
      name?: string;
      target_url?: string;
      logo_url?: string | null;
      is_active?: boolean;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.targetUrl !== undefined) patch.target_url = data.targetUrl;
    if (data.logoPath !== undefined) patch.logo_url = data.logoPath;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    const { error } = await context.supabase
      .from("sponsors")
      .update(patch)
      .eq("id", data.sponsorId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sponsorId: z.string().uuid(), clubId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    // Fetch storage path (if any) to clean up after row delete.
    const { data: existing } = await context.supabase
      .from("sponsors")
      .select("logo_url")
      .eq("id", data.sponsorId)
      .eq("club_id", data.clubId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("sponsors")
      .delete()
      .eq("id", data.sponsorId)
      .eq("club_id", data.clubId);
    if (error) throw new Error(error.message);
    if (existing?.logo_url) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(SPONSOR_LOGOS_BUCKET).remove([existing.logo_url]);
    }
    return { ok: true };
  });

// ============================================================================
// Admin — logo upload (signed upload URL)
// ============================================================================

const SponsorLogoUploadInput = z.object({
  clubId: z.string().uuid(),
  sponsorId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().min(1),
});

export const createSignedSponsorLogoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SponsorLogoUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.size > MAX_LOGO_SIZE) throw new Error("file_too_large");
    if (!ALLOWED_LOGO_MIME.has(data.contentType)) throw new Error("unsupported_format");
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    const rawExt = data.fileName
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!rawExt || !ALLOWED_LOGO_EXT.has(rawExt)) throw new Error("unsupported_format");
    const ext = rawExt === "jpeg" ? "jpg" : rawExt;
    const path = `sponsors/${data.clubId}/${data.sponsorId}-${Date.now()}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(SPONSOR_LOGOS_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !signed) throw new Error(error?.message ?? "signed_upload_failed");
    return { path: signed.path, token: signed.token };
  });

// ============================================================================
// Admin — stats
// ============================================================================

const StatsInput = z.object({
  clubId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getSponsorStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StatsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertClubRole({
      supabase: context.supabase,
      userId: context.userId,
      clubId: data.clubId,
      allowedRoles: ["admin"],
    });
    // Fetch sponsor names + aggregated stats over range.
    const [sponsorsRes, statsRes] = await Promise.all([
      context.supabase
        .from("sponsors")
        .select("id, name")
        .eq("club_id", data.clubId),
      context.supabase
        .from("sponsor_stats_daily")
        .select("sponsor_id, impressions, clicks")
        .eq("club_id", data.clubId)
        .gte("day", data.from)
        .lte("day", data.to),
    ]);
    if (sponsorsRes.error) throw new Error(sponsorsRes.error.message);
    if (statsRes.error) throw new Error(statsRes.error.message);
    const totals = new Map<string, { impressions: number; clicks: number }>();
    for (const row of statsRes.data ?? []) {
      const cur = totals.get(row.sponsor_id) ?? { impressions: 0, clicks: 0 };
      cur.impressions += row.impressions ?? 0;
      cur.clicks += row.clicks ?? 0;
      totals.set(row.sponsor_id, cur);
    }
    return (sponsorsRes.data ?? []).map((s) => {
      const t = totals.get(s.id) ?? { impressions: 0, clicks: 0 };
      const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
      return {
        sponsor_id: s.id,
        name: s.name,
        impressions: t.impressions,
        clicks: t.clicks,
        ctr,
      };
    });
  });
