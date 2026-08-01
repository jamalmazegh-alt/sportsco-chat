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
      .in("kind", ["terms", "privacy", "data_processing", "media", "notifications"])
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

    // Match by exact version_id for the locale's latest doc — NOT "latest consent
    // row per kind". Profiles default to preferred_language=en while Playwright
    // boots as fr-FR; users may have accepted fr then switched to en (or vice
    // versa). Taking only the newest row per kind falsely re-opens ConsentGate.
    const items = Array.from(latestByKind.values()).map((v) => {
      const rows = (mine ?? []).filter((c) => c.kind === v.kind && c.granted && !c.withdrawn_at);
      const match = rows.find((c) => c.version_id === v.id);
      const latestGranted = rows[0];
      return {
        kind: v.kind,
        version_id: v.id,
        version: v.version,
        required: v.required,
        title: v.title,
        content_md: v.content_md,
        granted: !!latestGranted,
        upToDate: !!match,
        consent_id: match?.id ?? latestGranted?.id ?? null,
      };
    });

    const missingRequired = items.filter((i) => i.required && !i.upToDate).length > 0;
    return { items, missingRequired };
  });

export const recordConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
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
        .parse(input),
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
    z.object({ consent_id: z.string().uuid() }).parse(input),
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
    z.object({ reason: z.string().max(1000).optional() }).parse(input ?? {}),
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
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
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
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("players")
      .update({ media_consent_status: data.status })
      .eq("id", data.player_id);
    if (error) throw error;

    // Trace the consent decision in user_consents for audit/GDPR.
    // We attach the latest published `media` consent version (any locale)
    // so the record is provable even years later.
    const { data: version } = await supabase
      .from("consent_versions")
      .select("id")
      .eq("kind", "media")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (version?.id) {
      await supabase.from("user_consents").insert({
        user_id: userId,
        version_id: version.id,
        kind: "media",
        granted: data.status === "granted",
        on_behalf_of_player_id: data.player_id,
      });
    }

    return { ok: true };
  });

/**
 * Active / désactive l'accès plateforme d'un joueur mineur, avec trace
 * versionnée du consentement parental (kind `parental_consent`,
 * on_behalf_of_player_id) — même pattern que setPlayerMediaConsent.
 *
 * L'activation est réservée au représentant légal : seul un parent lié
 * (player_parents) peut activer, avec attestation explicite — doublement
 * garanti par le trigger DB players_child_access_parent_guard. Le staff peut
 * seulement désactiver (action protectrice). La trace enregistre QUI a
 * consenti (user_id, version du document, horodatage).
 */
export const setChildPlatformAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { player_id: string; enabled: boolean; attestation?: boolean; locale?: string }) =>
      z
        .object({
          player_id: z.string().uuid(),
          enabled: z.boolean(),
          attestation: z.boolean().optional(),
          // Langue du document présenté au parent : la trace doit pointer vers
          // la version qu'il a réellement lue, pas une locale arbitraire.
          locale: z.string().min(2).max(5).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Erreurs métier renvoyées en résultat structuré, jamais en throw : un
    // throw non-Response dans un handler devient un 500 « h3 swallowed » que
    // src/server.ts remplace par la page d'erreur HTML pleine page.
    if (data.enabled && data.attestation !== true) {
      return { ok: false as const, error: "attestation_required" as const };
    }

    const { data: parentLink } = await supabase
      .from("player_parents")
      .select("id")
      .eq("player_id", data.player_id)
      .eq("parent_user_id", userId)
      .maybeSingle();

    // Activation réservée au représentant légal (doublée par la RPC + le trigger).
    if (data.enabled && !parentLink) {
      return { ok: false as const, error: "parent_required" as const };
    }

    // Chemin unique : la RPC écrit le drapeau ET la trace de consentement dans
    // la même transaction. Auparavant l'UPDATE était direct et l'insertion dans
    // `user_consents` était best-effort — un échec d'écriture renvoyait quand
    // même un succès, donc un consentement rapporté sans être enregistré.
    const { error } = await supabase.rpc("set_child_platform_access", {
      _player_id: data.player_id,
      _enabled: data.enabled,
      _attestation: data.attestation === true,
      _locale: data.locale ?? undefined,
    });
    if (error) {
      // Les erreurs métier de la RPC remontent en texte : on les remappe sur
      // les mêmes codes que ceux déjà attendus par l'interface.
      for (const code of [
        "attestation_required",
        "parent_required",
        "consent_version_missing",
        "player_not_found",
        "forbidden",
      ] as const) {
        if (error.message.includes(code)) return { ok: false as const, error: code };
      }
      return { ok: false as const, error: error.message };
    }

    return { ok: true as const, viaParentLink: !!parentLink };
  });
