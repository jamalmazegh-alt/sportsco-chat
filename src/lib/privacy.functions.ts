import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ConsentKind = z.enum(["terms", "privacy", "data_processing", "media", "notifications"]);

/**
 * Returns the latest published consent versions (all kinds) for a locale,
 * plus what the current user has accepted. Drives the onboarding consent gate.
 */
export const getConsentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { locale?: string }) => ({ locale: input?.locale ?? "en" }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: versions, error: vErr } = await supabase
      .from("consent_versions")
      .select("id, kind, version, locale, required, title, content_md, published_at")
      .eq("locale", data.locale)
      .order("version", { ascending: false });
    if (vErr) throw vErr;

    // Latest version per kind
    const latestByKind = new Map<string, (typeof versions)[number]>();
    for (const v of versions ?? []) {
      if (!latestByKind.has(v.kind)) latestByKind.set(v.kind, v);
    }

    const { data: mine, error: cErr } = await supabase
      .from("user_consents")
      .select("id, kind, version_id, granted, granted_at, withdrawn_at")
      .eq("user_id", userId)
      .is("on_behalf_of_player_id", null)
      .order("granted_at", { ascending: false });
    if (cErr) throw cErr;

    const accepted = new Map<string, (typeof mine)[number]>();
    for (const c of mine ?? []) if (!accepted.has(c.kind)) accepted.set(c.kind, c);

    const items = Array.from(latestByKind.values()).map((v) => {
      const a = accepted.get(v.kind);
      const upToDate = a && a.granted && !a.withdrawn_at && a.version_id === v.id;
      return {
        kind: v.kind,
        version_id: v.id,
        version: v.version,
        required: v.required,
        title: v.title,
        content_md: v.content_md,
        granted: !!(a && a.granted && !a.withdrawn_at),
        upToDate: !!upToDate,
        consent_id: a?.id ?? null,
      };
    });

    const missingRequired = items.filter((i) => i.required && !i.upToDate).length > 0;
    return { items, missingRequired };
  });

export const recordConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    kind: z.infer<typeof ConsentKind>;
    version_id: string;
    granted: boolean;
    on_behalf_of_player_id?: string | null;
  }) =>
    z
      .object({
        kind: ConsentKind,
        version_id: z.string().uuid(),
        granted: z.boolean(),
        on_behalf_of_player_id: z.string().uuid().nullable().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_consents").insert({
      user_id: userId,
      kind: data.kind,
      version_id: data.version_id,
      granted: data.granted,
      on_behalf_of_player_id: data.on_behalf_of_player_id ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const withdrawConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { consent_id: string }) =>
    z.object({ consent_id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_consents")
      .update({ withdrawn_at: new Date().toISOString(), granted: false })
      .eq("id", data.consent_id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const getConsentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_consents")
      .select("id, kind, granted, granted_at, withdrawn_at, on_behalf_of_player_id, version_id")
      .eq("user_id", userId)
      .order("granted_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { history: data ?? [] };
  });

export const requestDataExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("data_export_requests")
      .insert({ user_id: userId, status: "pending" })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id };
  });

export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reason?: string }) =>
    z.object({ reason: z.string().max(1000).optional() }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("account_deletion_requests")
      .insert({ user_id: userId, reason: data.reason ?? null })
      .select("id, scheduled_for")
      .single();
    if (error) throw error;
    return { id: row.id, scheduled_for: row.scheduled_for };
  });

export const cancelAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("account_deletion_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const getPrivacyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [exp, del] = await Promise.all([
      supabase
        .from("data_export_requests")
        .select("id, status, requested_at, completed_at, file_url")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(20),
      supabase
        .from("account_deletion_requests")
        .select("id, status, requested_at, scheduled_for, processed_at, reason")
        .eq("user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(20),
    ]);
    return {
      exports: exp.data ?? [],
      deletions: del.data ?? [],
    };
  });

/**
 * Set media consent for a player (parent or admin/coach of the club).
 */
export const setPlayerMediaConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { player_id: string; status: "pending" | "granted" | "denied" }) =>
    z
      .object({
        player_id: z.string().uuid(),
        status: z.enum(["pending", "granted", "denied"]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("players")
      .update({ media_consent_status: data.status })
      .eq("id", data.player_id);
    if (error) throw error;
    return { ok: true };
  });
