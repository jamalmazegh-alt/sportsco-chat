/**
 * Server functions pour l'outil d'import super-admin.
 *
 * Toutes les fonctions vérifient explicitement que l'appelant est super-admin
 * via la table `super_admins` (RLS bypass via service role).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { createLogger } from "@/lib/logger.server";
import { logActivity } from "@/lib/observability/log-activity.server";
import { redactErrorMessage } from "@/lib/observability/redact";
import {
  type AnalysisResult,
  type ImportType,
  ENTITY_MAX_ROWS,
  PLANNING_MAX_ROWS,
  RECURRENCE_OCCURRENCE_CAP,
  getFields,
  normalizeHeader,
} from "./schemas";
import { parseTemplate } from "./template-parse";
import { computeFffCategory, parseSeasonEndYear, seasonLabelFromEndYear } from "@/lib/fff-category";

const log = createLogger("superadmin-import");

async function assertSuperAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
}

/**
 * Allow super_admin OR admin/coach of the target club.
 * Used by the shared import server fns so the same pipeline serves both the
 * superadmin wizard and the coach dialog.
 */
async function assertImportAccess(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  clubId: string,
) {
  const { data: sa } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (sa) return;
  const { data, error } = await supabase
    .from("club_members")
    .select("roles, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Response("Internal error", { status: 500 });
  if (!data) throw new Response("Forbidden", { status: 403 });
  const rolesArr = (data as { roles?: string[] | null }).roles ?? [];
  const roleSingle = (data as { role?: string | null }).role;
  const roles = new Set<string>([...(rolesArr as string[]), ...(roleSingle ? [roleSingle] : [])]);
  if (!roles.has("admin") && !roles.has("coach")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/** Mirrors public.normalize_name(text): unaccent → lower → [^a-z0-9] stripped. */
function normalizeName(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Coach mode: inject equipe/sport/categorie from the target team so the
 * uploaded file may omit those columns. Also verifies the team belongs to
 * clubId (defense in depth against a client-forged teamId).
 */
async function injectTeamContext(
  teamId: string,
  clubId: string,
  headers: string[],
  rawRows: Array<Record<string, unknown>>,
): Promise<{
  headers: string[];
  rawRows: Array<Record<string, unknown>>;
  team: { id: string; name: string; sport: string | null; age_group: string | null };
}> {
  const { data: team, error } = await supabaseAdmin
    .from("teams")
    .select("id, club_id, name, sport, age_group")
    .eq("id", teamId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!team || team.club_id !== clubId) throw new Response("Forbidden", { status: 403 });
  const extra: Record<string, string> = {
    equipe: team.name,
    sport: team.sport ?? "",
    categorie: team.age_group ?? "",
  };
  const augmentedHeaders = [...headers];
  for (const k of Object.keys(extra)) if (!augmentedHeaders.includes(k)) augmentedHeaders.push(k);
  const augmentedRows = rawRows.map((r) => {
    const out = { ...r };
    for (const [k, v] of Object.entries(extra)) if (out[k] == null || out[k] === "") out[k] = v;
    return out;
  });
  return { headers: augmentedHeaders, rawRows: augmentedRows, team };
}

// ============================================================
// 1) Liste des clubs (recherche autocomplete)
// ============================================================
export const listClubsForImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ search: z.string().trim().max(120).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    let q = supabaseAdmin
      .from("clubs")
      .select("id, name, created_at")
      .is("archived_at", null)
      .eq("is_personal", false)
      .order("name")
      .limit(500);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: clubs, error } = await q;
    if (error) throw new Error(error.message);
    return { clubs: clubs ?? [] };
  });

// ============================================================
// 2) Stats club + dernier import
// ============================================================
export const getClubImportStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clubId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const [teams, players, coaches, imports] = await Promise.all([
      supabaseAdmin
        .from("teams")
        .select("id", { count: "exact", head: true })
        .eq("club_id", data.clubId)
        .is("deleted_at", null),
      supabaseAdmin
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("club_id", data.clubId)
        .is("deleted_at", null),
      supabaseAdmin
        .from("club_members")
        .select("user_id", { count: "exact", head: true })
        .eq("club_id", data.clubId)
        .contains("roles", ["coach"]),
      supabaseAdmin
        .from("superadmin_imports")
        .select("id, created_at, import_type, status, rows_imported, file_name")
        .eq("club_id", data.clubId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    return {
      teams: teams.count ?? 0,
      players: players.count ?? 0,
      coaches: coaches.count ?? 0,
      imports: imports.data ?? [],
    };
  });

// ============================================================
// 3) Analyse IA — Gemini Flash via gateway Lovable
// ============================================================
// Schéma simple : l'IA ne produit QUE le mapping (en-tête source → clé Clubero).
// Toute la normalisation/validation est ensuite faite localement par parseTemplate.
// → bien plus robuste que de demander à Gemini des objets cellules dynamiques.
const aiMappingSchema = z.object({
  mapping: z.array(
    z.object({
      source: z.string().describe("En-tête tel qu'il apparaît dans le fichier source"),
      field: z
        .string()
        .describe("Clé Clubero cible, ou 'ignore' si la colonne n'a pas d'équivalent"),
    }),
  ),
});

const SYSTEM_PROMPT = `Tu es un assistant d'import pour Clubero (plateforme de clubs sportifs).
Ta seule tâche : mapper les colonnes du fichier source vers les champs Clubero.

Règles :
- Pour CHAQUE en-tête source listé, renvoie une entrée { source, field }.
- field doit être l'une des clés Clubero attendues, ou exactement "ignore" si aucune ne correspond.
- N'invente pas de clé : utilise uniquement celles fournies dans la liste.
- Sois tolérant aux abréviations, anglais, accents, casse, espaces.
- Exemples de correspondance sémantique d'en-tête : "first name" → prenom, "DOB" → date_naissance, "team" → equipe, "category" → categorie, "phone" → telephone.

VÉRIFICATION SÉMANTIQUE DES DONNÉES (important) :
- Regarde aussi l'échantillon de valeurs sous chaque en-tête. Si les valeurs ne correspondent PAS à ce que suggère l'en-tête, fais confiance aux données et remappe.
  Ex. en-tête "prenom_joueur" mais valeurs "30/00/2012", "15/08/2013" → field = "date_naissance" (les données sont clairement des dates).
  Ex. en-tête "saison" mais valeurs "0641726100", "0768262000" → field = "telephone_joueur".
  Ex. en-tête "genre" mais valeurs "Attaquant", "Gardien" → field = "poste".
- Si plusieurs en-têtes source pointeraient vers la même clé Clubero à cause d'un décalage évident (colonnes shiftées), résous le décalage en cascade en te basant sur le type de données de chaque colonne (date, email, téléphone numérique, nom court, mot du vocabulaire genre/poste, etc.), pas sur les libellés.
- Si une colonne n'a aucun sens exploitable (valeurs vides ou incohérentes) → "ignore".`;

export const analyzeFileWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        teamId: z.string().uuid().optional(),
        type: z.enum(["players", "coaches", "planning"]),
        headers: z.array(z.string()).min(1).max(50),
        rawRows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertImportAccess(context.supabase, context.userId, data.clubId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY non configurée");

    let headers = data.headers;
    let rawRows = data.rawRows;
    if (data.teamId) {
      const ctx = await injectTeamContext(data.teamId, data.clubId, headers, rawRows);
      headers = ctx.headers;
      rawRows = ctx.rawRows;
    }

    const fields = getFields(data.type);
    const validKeys = new Set(fields.map((f) => f.key));
    const fieldList = fields
      .map((f) => `${f.key} (${f.required ? "obligatoire" : "optionnel"})`)
      .join(", ");

    // Pré-mapping trivial : normalisation partagée avec le parsing template
    // (tokens, stopwords, synonymes `N°`/`num`/`#` → `numero`, `jersey` →
    // `maillot`, `license` → `licence`, etc.). Ça couvre le modèle officiel
    // et les libellés humains sans appel IA, et évite qu'une hallucination
    // fasse rater le mapping.

    const keyByNorm = new Map<string, string>();
    const labelByNorm = new Map<string, string>();
    for (const f of fields) {
      keyByNorm.set(normalizeHeader(f.key), f.key);
      labelByNorm.set(normalizeHeader(f.label), f.key);
    }

    const mapping: Record<string, string> = {};
    const unmapped: string[] = [];
    for (const h of headers) {
      const n = normalizeHeader(h);
      const hit = keyByNorm.get(n) ?? labelByNorm.get(n);
      if (hit) mapping[h] = hit;
      else unmapped.push(h);
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    if (unmapped.length > 0) {
      try {
        const { object } = await generateObject({
          model,
          schema: aiMappingSchema,
          system: SYSTEM_PROMPT,
          prompt: `Type d'import : ${data.type}
Clés Clubero valides : ${fieldList}

En-têtes source à mapper :
${JSON.stringify(unmapped)}

Échantillon des premières lignes (utilise-le pour vérifier la cohérence en-tête ↔ valeurs) :
${JSON.stringify(rawRows.slice(0, 8))}


Renvoie le mapping en couvrant TOUS les en-têtes source ci-dessus.`,
          abortSignal: AbortSignal.timeout(30_000),
        });
        for (const m of object.mapping) {
          if (m.field && m.field !== "ignore" && validKeys.has(m.field)) {
            mapping[m.source] = m.field;
          }
        }
      } catch (e) {
        log.error("AI analysis chunk failed", { error: String(e) });
        // Non bloquant : on continue avec le pré-mapping trivial. Les colonnes
        // non reconnues seront visibles dans l'écran d'édition manuelle.
      }
    }

    // In coach mode we already injected equipe/sport/categorie by their
    // canonical keys — pass them through as-is so parseTemplate finds them.
    if (data.teamId) {
      for (const k of ["equipe", "sport", "categorie"]) {
        if (headers.includes(k) && !mapping[k]) mapping[k] = k;
      }
    }

    const renamedHeaders = headers.map((h) => mapping[h] ?? h);
    const renamedRows = rawRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        const target = mapping[k];
        if (target) out[target] = v;
      }
      return out;
    });

    const parsed = parseTemplate(data.type, renamedHeaders, renamedRows);
    parsed.mapping = mapping;
    return parsed as AnalysisResult;
  });

// ============================================================
// 4) Parsing template direct (sans IA) — appelé serveur pour homogénéité
// ============================================================
export const parseTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        teamId: z.string().uuid().optional(),
        type: z.enum(["players", "coaches", "planning"]),
        headers: z.array(z.string()).min(1).max(50),
        rawRows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertImportAccess(context.supabase, context.userId, data.clubId);
    let headers = data.headers;
    let rawRows = data.rawRows;
    if (data.teamId) {
      const ctx = await injectTeamContext(data.teamId, data.clubId, headers, rawRows);
      headers = ctx.headers;
      rawRows = ctx.rawRows;
    }
    return parseTemplate(data.type, headers, rawRows);
  });

// ============================================================
// 5) Import final — service role
// ============================================================

const importRowsSchema = z.array(z.record(z.string(), z.string().nullable()));

type RowMap = Record<string, string | null>;

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function expandOccurrences(dateDebut: string, daysFr: string[], fin: string): Date[] {
  const dayMap: Record<string, number> = {
    Dimanche: 0,
    Lundi: 1,
    Mardi: 2,
    Mercredi: 3,
    Jeudi: 4,
    Vendredi: 5,
    Samedi: 6,
  };
  const targets = new Set(daysFr.map((d) => dayMap[d]).filter((n) => n !== undefined));
  const out: Date[] = [];
  let cur = new Date(dateDebut + "T00:00:00Z");
  const end = new Date(fin + "T00:00:00Z");
  while (cur.getTime() <= end.getTime() && out.length < RECURRENCE_OCCURRENCE_CAP) {
    if (targets.has(cur.getUTCDay())) out.push(new Date(cur));
    cur = new Date(cur.getTime() + 86400000);
  }
  return out;
}

async function findOrCreateTeam(
  clubId: string,
  name: string,
  sport: string,
  category: string,
  genre: string | null,
  saison: string | null,
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("club_id", clubId)
    .eq("name", name)
    .eq("sport", sport)
    .eq("age_group", category)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data: inserted, error } = await supabaseAdmin
    .from("teams")
    .insert({
      club_id: clubId,
      name,
      sport,
      age_group: category,
      season: saison,
      championship: genre,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Création équipe ${name} : ${error.message}`);
  return { id: inserted.id, created: true };
}

async function findOrCreateProfileByEmail(email: string, fullName: string): Promise<string | null> {
  // Trouver un utilisateur existant — invoque la fonction RPC dédiée (compat avec types générés)
  const { data: rpc } = await supabaseAdmin.rpc(
    "email_exists" as never,
    { _email: email } as never,
  );
  if (rpc && typeof rpc === "object" && "user_id" in (rpc as object)) {
    const userId = (rpc as { user_id: string }).user_id;
    if (userId) return userId;
  }
  // Pas de profil → on n'a pas le droit d'insérer dans auth.users sans inviteUserByEmail
  // → renvoie null, le caller décidera (invite Supabase Auth ou skip)
  return null;
}

/**
 * Crée un member_invites + envoie l'email player-invite (template Clubero).
 * Renvoie le token créé, ou null en cas d'échec.
 */
async function createInviteAndEmail(params: {
  clubId: string;
  clubName?: string;
  clubLogoUrl?: string;
  clubDefaultLanguage?: string | null;
  teamId?: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: "coach" | "dirigeant" | "parent" | "player";
  parentForPlayerId?: string | null;
  createdBy: string;
  roleLabel?: string;
  playerName?: string;
}): Promise<string | null> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data: insertedInvite, error: invErr } = await supabaseAdmin
    .from("member_invites")
    .insert({
      club_id: params.clubId,
      team_id: params.teamId ?? null,
      role: params.role as never,
      email: params.email.toLowerCase(),
      first_name: params.firstName || null,
      last_name: params.lastName || null,
      phone: params.phone || null,
      parent_for_player_id: params.parentForPlayerId ?? null,
      token,
      created_by: params.createdBy,
    } as never)
    .select("id")
    .single();
  if (invErr || !insertedInvite) {
    log.warn("member_invites insert failed", {
      email: params.email,
      error: invErr?.message ?? "no row returned",
    });
    return null;
  }
  const inviteId = (insertedInvite as { id: string }).id;

  try {
    const inviteUrl = `https://clubero.app/register?invite=${encodeURIComponent(token)}`;
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
    const { resolveEmailLocale } = await import("@/lib/email/locale");
    const enqueued = await enqueueTransactionalEmailServer({
      templateName: "player-invite",
      recipientEmail: params.email,
      idempotencyKey: `import-invite-${token}`,
      templateData: {
        firstName: params.firstName || undefined,
        clubName: params.clubName,
        clubLogoUrl: params.clubLogoUrl,
        inviteUrl,
        roleLabel: params.roleLabel ?? params.role,
        playerName: params.playerName,
        locale: resolveEmailLocale(params.clubDefaultLanguage),
      },
    });
    if (enqueued?.messageId) {
      await supabaseAdmin
        .from("member_invites")
        .update({ email_message_id: enqueued.messageId } as never)
        .eq("id", inviteId);
    }
    return token;
  } catch (e) {
    // Silent enqueue failure previously left orphan member_invites rows with no
    // actual email sent. Log the real error and roll the invite back so the
    // caller can retry deterministically.
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("createInviteAndEmail enqueue failed", {
      email: params.email,
      role: params.role,
      error: err.message,
      stack: err.stack,
    });
    log.warn("invite+email failed", { email: params.email, error: err.message });
    await supabaseAdmin.from("member_invites").delete().eq("id", inviteId);
    return null;
  }
}

/**
 * Fields that can be updated on an existing player when the caller explicitly
 * authorizes each one via `fieldOverrides` (per-row). Blank-fill still applies
 * unconditionally for the same columns except first_name/last_name (identity).
 */
const PLAYER_OVERWRITABLE_FIELDS = [
  "first_name",
  "last_name",
  "jersey_number",
  "license_number",
  "preferred_position",
  "email",
  "phone",
] as const;

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests) — no DB access, no side effects.
// ---------------------------------------------------------------------------

/** Same normalization as `public.normalize_name` (unaccent + lower + alnum). */
export const _normalizeName = normalizeName;

export type ResolveTeamInput = {
  equipe: string | null | undefined;
  sport: string | null | undefined;
  categorie: string | null | undefined;
  teamOverrides?: Record<string, string>;
  teamsToCreate?: Set<string>;
  teamsByNorm: Map<string, string>;
};

export type ResolveTeamResult =
  | { kind: "override"; teamKey: string; teamId: string }
  | { kind: "matched"; teamKey: string; teamId: string }
  | { kind: "create"; teamKey: string }
  | { kind: "error"; message: string };

/**
 * Resolve a team for one player row using the same rules as `runImport`:
 * override > normalized match > explicit "create" > error.
 * NEVER creates implicitly.
 */
export function resolveTeamForRow(input: ResolveTeamInput): ResolveTeamResult {
  const { equipe, sport, categorie } = input;
  if (!equipe || !sport || !categorie) {
    return { kind: "error", message: "équipe/sport/catégorie manquants" };
  }
  const teamKey = `${equipe}|${sport}|${categorie}`;
  const override = input.teamOverrides?.[teamKey];
  if (override) return { kind: "override", teamKey, teamId: override };
  const normKey = `${normalizeName(equipe)}|${normalizeName(sport)}|${normalizeName(categorie)}`;
  const matched = input.teamsByNorm.get(normKey);
  if (matched) return { kind: "matched", teamKey, teamId: matched };
  if (input.teamsToCreate?.has(teamKey)) return { kind: "create", teamKey };
  return {
    kind: "error",
    message: `Équipe non résolue: ${equipe} / ${sport} / ${categorie} — choisir une équipe existante ou cocher "créer".`,
  };
}

export type FieldSpec = {
  col: (typeof PLAYER_OVERWRITABLE_FIELDS)[number];
  incoming: string | number | null;
  current: string | number | null;
  allowBlankFill: boolean;
};

/**
 * Compute the patch to apply to an existing player row.
 * Rules: blank-fill (only when `allowBlankFill` and current is empty),
 * overwrite ONLY if the field is explicitly in `allowed` AND value differs.
 * first_name/last_name are identity and cannot be blank-filled.
 */
export function computePlayerPatch(
  specs: FieldSpec[],
  allowed: Set<string>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const s of specs) {
    if (s.incoming == null || s.incoming === "") continue;
    const currentEmpty = s.current == null || s.current === "";
    if (currentEmpty && s.allowBlankFill) {
      patch[s.col] = s.incoming;
    } else if (allowed.has(s.col) && s.incoming !== s.current) {
      patch[s.col] = s.incoming;
    }
  }
  return patch;
}

export const runImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        teamId: z.string().uuid().optional(),
        type: z.enum(["players", "coaches", "planning"]),
        rows: importRowsSchema,
        sendInvitations: z.boolean().default(false),
        fileName: z.string().max(255).optional(),
        iaUsed: z.boolean().default(false),
        /** teamKey (`equipe|sport|categorie`) → team_id resolved by the caller. */
        teamOverrides: z.record(z.string(), z.string().uuid()).optional(),
        /** row index (0-based, as string) → list of columns authorized to overwrite. */
        fieldOverrides: z.record(z.string(), z.array(z.string())).optional(),
        /** teamKeys the caller explicitly authorizes to CREATE when unresolved. */
        teamsToCreate: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertImportAccess(context.supabase, context.userId, data.clubId);

    // If a teamId is provided, verify it belongs to the club (defense in depth).
    let fixedTeam: {
      id: string;
      name: string;
      sport: string | null;
      age_group: string | null;
    } | null = null;
    if (data.teamId) {
      const { data: t } = await supabaseAdmin
        .from("teams")
        .select("id, club_id, name, sport, age_group")
        .eq("id", data.teamId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!t || t.club_id !== data.clubId) throw new Response("Forbidden", { status: 403 });
      fixedTeam = { id: t.id, name: t.name, sport: t.sport, age_group: t.age_group };
    }

    // Validate teamOverrides — each mapped team_id must belong to clubId.
    if (data.teamOverrides && Object.keys(data.teamOverrides).length > 0) {
      const ids = Array.from(new Set(Object.values(data.teamOverrides)));
      const { data: teamsCheck, error: tcErr } = await supabaseAdmin
        .from("teams")
        .select("id, club_id")
        .in("id", ids);
      if (tcErr) throw new Error(tcErr.message);
      const okIds = new Set(
        (teamsCheck ?? []).filter((t) => t.club_id === data.clubId).map((t) => t.id),
      );
      for (const id of ids) {
        if (!okIds.has(id)) throw new Response("Forbidden", { status: 403 });
      }
    }

    // Hard limits
    const maxRows = data.type === "planning" ? PLANNING_MAX_ROWS : ENTITY_MAX_ROWS;
    if (data.rows.length > maxRows) {
      throw new Error(`Trop de lignes (max ${maxRows} pour ${data.type})`);
    }

    const errors: Array<{ row: number; error: string }> = [];
    let imported = 0;
    const summary: Record<string, number> = {};

    // Contexte club pour personnaliser les invitations email
    const { data: clubRow } = await supabaseAdmin
      .from("clubs")
      .select("name, logo_url, default_language")
      .eq("id", data.clubId)
      .maybeSingle();
    const clubName = clubRow?.name ?? undefined;
    const clubLogoUrl = clubRow?.logo_url ?? undefined;
    const clubDefaultLanguage =
      (clubRow as { default_language?: string | null } | null)?.default_language ?? null;

    try {
      if (data.type === "players") {
        const teamCache = new Map<string, string>();
        const parentCache = new Map<string, string>();
        const toCreate = new Set(data.teamsToCreate ?? []);
        let teamsCreated = 0;
        let playersCreated = 0;
        let playersUpdated = 0;
        let playersRestored = 0;
        let playersLinked = 0;
        let parentsCreated = 0;
        let invitationsSent = 0;

        // Preload club teams for normalized dedupe (case/accents-insensitive).
        const { data: clubTeamsList } = await supabaseAdmin
          .from("teams")
          .select("id, name, sport, age_group")
          .eq("club_id", data.clubId)
          .is("deleted_at", null);
        const teamsByNorm = new Map<string, string>();
        const normTeamKey = (name: string, sport: string | null, cat: string | null) =>
          `${normalizeName(name)}|${normalizeName(sport)}|${normalizeName(cat)}`;
        for (const t of clubTeamsList ?? []) {
          teamsByNorm.set(normTeamKey(t.name, t.sport, t.age_group), t.id);
        }

        // Preload the club's current season (used as a fallback when the row
        // omits `saison`). Import doesn't create seasons — if none is current,
        // we derive a label from today so `player_seasons.season_label`
        // (NOT NULL) always has a sensible value.
        const { data: currentSeasonRow } = await supabaseAdmin
          .from("seasons")
          .select("label")
          .eq("club_id", data.clubId)
          .eq("is_current", true)
          .maybeSingle();
        const fallbackSeasonEndYear = (() => {
          const today = new Date();
          const y = today.getUTCFullYear();
          return today.getUTCMonth() >= 6 ? y + 1 : y;
        })();
        const fallbackSeasonLabel =
          currentSeasonRow?.label ?? seasonLabelFromEndYear(fallbackSeasonEndYear);

        // Load full club roster (active + soft-deleted) once — identity index.
        type ExistingPlayer = {
          id: string;
          first_name: string | null;
          last_name: string | null;
          birth_date: string | null;
          jersey_number: number | null;
          license_number: string | null;
          preferred_position: string | null;
          email: string | null;
          phone: string | null;
          deleted_at: string | null;
        };
        const { data: clubPlayers, error: rosterErr } = await supabaseAdmin
          .from("players")
          .select(
            "id, first_name, last_name, birth_date, jersey_number, license_number, preferred_position, email, phone, deleted_at",
          )
          .eq("club_id", data.clubId);
        if (rosterErr) throw new Error(rosterErr.message);

        const playersByIdentity = new Map<string, ExistingPlayer>();
        // Fallback dedup: same club + normalized (first_name, last_name, jersey_number).
        // Rattrape les cas où la date de naissance diffère entre imports
        // (format JJ/MM vs MM/JJ, valeur manquante...) qui produiraient sinon
        // des fiches en double pour le même joueur.
        const playersByNameJersey = new Map<string, ExistingPlayer>();
        const identityKey = (
          first: string | null | undefined,
          last: string | null | undefined,
          birth: string | null | undefined,
        ): string | null => {
          if (!birth) return null;
          const f = normalizeName(first);
          const l = normalizeName(last);
          if (!f || !l) return null;
          return `${f}|${l}|${birth}`;
        };
        const nameJerseyKey = (
          first: string | null | undefined,
          last: string | null | undefined,
          jersey: number | null | undefined,
        ): string | null => {
          if (jersey == null) return null;
          const f = normalizeName(first);
          const l = normalizeName(last);
          if (!f || !l) return null;
          return `${f}|${l}|#${jersey}`;
        };
        for (const p of (clubPlayers ?? []) as ExistingPlayer[]) {
          const k = identityKey(p.first_name, p.last_name, p.birth_date);
          if (k) {
            const prev = playersByIdentity.get(k);
            if (!prev || (prev.deleted_at && !p.deleted_at)) playersByIdentity.set(k, p);
          }
          const nk = nameJerseyKey(p.first_name, p.last_name, p.jersey_number);
          if (nk) {
            const prev = playersByNameJersey.get(nk);
            if (!prev || (prev.deleted_at && !p.deleted_at)) playersByNameJersey.set(nk, p);
          }
        }

        for (let i = 0; i < data.rows.length; i++) {
          const r = data.rows[i] as RowMap;
          try {
            // DOB mandatory — identity key requires it.
            if (!r.date_naissance) {
              throw new Error("date de naissance requise");
            }

            // Resolve team. Explicit contract:
            //  1) fixed team (coach dialog, teamId prop)
            //  2) caller override (UI dropdown chose an existing team)
            //  3) normalized match against club roster (dedupe casse/accents)
            //  4) explicit "create" opt-in via teamsToCreate — otherwise ERROR.
            // Implicit creation is forbidden here — a silent create was the
            // exact bug we're closing.
            let teamId: string;
            if (fixedTeam) {
              teamId = fixedTeam.id;
            } else {
              if (!r.equipe || !r.sport || !r.categorie) {
                throw new Error("équipe/sport/catégorie manquants");
              }
              const teamKey = `${r.equipe}|${r.sport}|${r.categorie}`;
              const override = data.teamOverrides?.[teamKey];
              const cached = teamCache.get(teamKey);
              if (override) {
                teamId = override;
                teamCache.set(teamKey, teamId);
              } else if (cached) {
                teamId = cached;
              } else {
                const normKey = normTeamKey(r.equipe, r.sport, r.categorie);
                const matched = teamsByNorm.get(normKey);
                if (matched) {
                  teamId = matched;
                  teamCache.set(teamKey, teamId);
                } else if (toCreate.has(teamKey)) {
                  const { data: inserted, error: cErr } = await supabaseAdmin
                    .from("teams")
                    .insert({
                      club_id: data.clubId,
                      name: r.equipe,
                      sport: r.sport,
                      age_group: r.categorie,
                      season: r.saison,
                      championship: r.genre,
                    })
                    .select("id")
                    .single();
                  if (cErr) throw new Error(`Création équipe ${r.equipe}: ${cErr.message}`);
                  teamId = inserted.id;
                  teamsByNorm.set(normKey, teamId);
                  teamCache.set(teamKey, teamId);
                  teamsCreated++;
                } else {
                  throw new Error(
                    `Équipe non résolue: ${r.equipe} / ${r.sport} / ${r.categorie} — choisir une équipe existante ou cocher "créer".`,
                  );
                }
              }
            }

            const firstName = titleCase(r.prenom_joueur!);
            const lastName = titleCase(r.nom_joueur!);
            const idKey = identityKey(firstName, lastName, r.date_naissance)!;
            const jerseyNum = r.numero_maillot ? parseInt(r.numero_maillot, 10) : null;

            let existing = playersByIdentity.get(idKey) ?? null;
            // Fallback: same name + jersey in the same club → treat as the same
            // player (override), même si la date de naissance a été parsée
            // différemment entre deux imports.
            if (!existing) {
              const nk = nameJerseyKey(firstName, lastName, jerseyNum);
              if (nk) existing = playersByNameJersey.get(nk) ?? null;
            }
            let playerId: string;

            if (existing && existing.deleted_at) {
              // Restore directement via service role — assertImportAccess a déjà
              // validé le droit d'écriture sur ce club. On n'utilise pas le RPC
              // restore_entity qui exige auth.uid() (NULL avec supabaseAdmin).
              const { error: restoreErr } = await supabaseAdmin
                .from("players")
                .update({ deleted_at: null } as never)
                .eq("id", existing.id);
              if (restoreErr) throw new Error(restoreErr.message);
              existing = { ...existing, deleted_at: null };
              playersRestored++;
            }

            if (existing) {
              // Non-destructive patch: blank-fill always; overwrite only if caller
              // authorized that specific field via fieldOverrides[rowIndex].
              const allowed = new Set(data.fieldOverrides?.[String(i)] ?? []);
              const specs: Array<{
                col: (typeof PLAYER_OVERWRITABLE_FIELDS)[number];
                incoming: string | number | null;
                current: string | number | null;
                allowBlankFill: boolean;
              }> = [
                {
                  col: "first_name",
                  incoming: firstName || null,
                  current: existing.first_name,
                  allowBlankFill: false,
                },
                {
                  col: "last_name",
                  incoming: lastName || null,
                  current: existing.last_name,
                  allowBlankFill: false,
                },
                {
                  col: "jersey_number",
                  incoming: jerseyNum,
                  current: existing.jersey_number,
                  allowBlankFill: true,
                },
                {
                  col: "license_number",
                  incoming: r.numero_licence || null,
                  current: existing.license_number,
                  allowBlankFill: true,
                },
                {
                  col: "preferred_position",
                  incoming: r.poste || null,
                  current: existing.preferred_position,
                  allowBlankFill: true,
                },
                {
                  col: "email",
                  incoming: r.email_contact ? r.email_contact.toLowerCase() : null,
                  current: existing.email,
                  allowBlankFill: true,
                },
                {
                  col: "phone",
                  incoming: r.telephone_joueur || null,
                  current: existing.phone,
                  allowBlankFill: true,
                },
              ];
              const patch: Record<string, unknown> = {};
              for (const s of specs) {
                if (s.incoming == null || s.incoming === "") continue;
                const currentEmpty = s.current == null || s.current === "";
                if (currentEmpty && s.allowBlankFill) {
                  patch[s.col] = s.incoming;
                } else if (allowed.has(s.col) && s.incoming !== s.current) {
                  patch[s.col] = s.incoming;
                }
              }
              if (Object.keys(patch).length > 0) {
                const { error: upErr } = await supabaseAdmin
                  .from("players")
                  .update(patch as never)
                  .eq("id", existing.id);
                if (upErr) throw new Error(upErr.message);
                playersUpdated++;
                existing = { ...existing, ...(patch as Partial<ExistingPlayer>) };
                playersByIdentity.set(idKey, existing);
              }
              playerId = existing.id;
            } else {
              const { data: inserted, error: pErr } = await supabaseAdmin
                .from("players")
                .insert({
                  club_id: data.clubId,
                  first_name: firstName,
                  last_name: lastName,
                  birth_date: r.date_naissance,
                  jersey_number: jerseyNum,
                  license_number: r.numero_licence || null,
                  preferred_position: r.poste || null,
                  phone: r.telephone_joueur || null,
                  email: r.email_contact?.toLowerCase() || null,
                })
                .select(
                  "id, first_name, last_name, birth_date, jersey_number, license_number, preferred_position, email, phone, deleted_at",
                )
                .single();
              if (pErr) {
                if ((pErr as { code?: string }).code === "23505") {
                  throw new Error("Identité déjà existante dans ce club");
                }
                throw new Error(pErr.message);
              }
              playersCreated++;
              playersByIdentity.set(idKey, inserted as ExistingPlayer);
              const nk = nameJerseyKey(firstName, lastName, jerseyNum);
              if (nk) playersByNameJersey.set(nk, inserted as ExistingPlayer);
              playerId = inserted.id;
            }

            // Link team_members if missing (ignore duplicate errors).
            const { error: tmErr } = await supabaseAdmin.from("team_members").insert({
              team_id: teamId,
              player_id: playerId,
              role: "player" as never,
            });
            if (tmErr) {
              if ((tmErr as { code?: string }).code !== "23505") {
                throw new Error(tmErr.message);
              }
            } else {
              playersLinked++;
            }

            const player = { id: playerId };

            // Upsert `player_seasons` avec la catégorie FFF calculée.
            // Non-destructif : si une ligne existe déjà pour (player, club,
            // saison), on ne touche PAS à `category` (surclassement manuel
            // saisi via l'UI /players/$playerId/seasons est préservé).
            try {
              const seasonLabelRaw = r.saison || fallbackSeasonLabel;
              const endYear = parseSeasonEndYear(seasonLabelRaw) ?? fallbackSeasonEndYear;
              const normalizedSeasonLabel =
                parseSeasonEndYear(seasonLabelRaw) != null
                  ? seasonLabelFromEndYear(endYear)
                  : fallbackSeasonLabel;
              const computedCategory = computeFffCategory(r.date_naissance, endYear);
              const sportForSeason = (fixedTeam?.sport ?? r.sport ?? null) as string | null;
              const { data: existingSeason } = await supabaseAdmin
                .from("player_seasons")
                .select("id, category, team_id, sport")
                .eq("player_id", playerId)
                .eq("club_id", data.clubId)
                .eq("season_label", normalizedSeasonLabel)
                .maybeSingle();
              if (!existingSeason) {
                await supabaseAdmin.from("player_seasons").insert({
                  player_id: playerId,
                  club_id: data.clubId,
                  team_id: teamId,
                  season_label: normalizedSeasonLabel,
                  sport: sportForSeason,
                  category: computedCategory,
                } as never);
              } else {
                // Blank-fill uniquement : jamais d'écrasement d'une valeur
                // déjà saisie manuellement (protège les surclassements).
                const patch: Record<string, unknown> = {};
                if (!existingSeason.category && computedCategory) {
                  patch.category = computedCategory;
                }
                if (!existingSeason.team_id && teamId) patch.team_id = teamId;
                if (!existingSeason.sport && sportForSeason) patch.sport = sportForSeason;
                if (Object.keys(patch).length > 0) {
                  await supabaseAdmin
                    .from("player_seasons")
                    .update(patch as never)
                    .eq("id", existingSeason.id);
                }
              }
            } catch (e) {
              // Non-bloquant : l'échec du calcul de catégorie ne doit pas
              // faire échouer l'import du joueur (backfill possible ensuite).
              log.warn("player_seasons upsert failed", {
                playerId,
                error: e instanceof Error ? e.message : String(e),
              });
            }

            const playerFullName =
              `${titleCase(r.prenom_joueur!)} ${titleCase(r.nom_joueur!)}`.trim();

            // Invitation joueur — UNIQUEMENT si joueur majeur (>= 18 ans).
            // Les mineurs ne peuvent être invités qu'après accord parental,
            // via l'action déclenchée par un parent (ou coach avec accord).
            const isAdultPlayer = (() => {
              if (!r.date_naissance) return false;
              const dob = new Date(r.date_naissance);
              if (Number.isNaN(dob.getTime())) return false;
              const now = new Date();
              let age = now.getFullYear() - dob.getFullYear();
              const m = now.getMonth() - dob.getMonth();
              if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
              return age >= 18;
            })();
            if (r.email_contact && data.sendInvitations && isAdultPlayer) {
              const token = await createInviteAndEmail({
                clubId: data.clubId,
                clubName,
                clubLogoUrl,
                clubDefaultLanguage,
                teamId,
                email: r.email_contact,
                firstName: titleCase(r.prenom_joueur!),
                lastName: titleCase(r.nom_joueur!),
                role: "player",
                createdBy: context.userId,
                roleLabel: "joueur",
              });
              if (token) invitationsSent++;
            }

            // Parents — dédup applicative composite (email → phone → nom
            // normalisé) contre les parents déjà rattachés au joueur, pour
            // éviter les doublons à la réimportation (parent_user_id NULL
            // rend inopérante la contrainte unique DB).
            const { data: existingParents } = await supabaseAdmin
              .from("player_parents")
              .select("full_name, email, phone")
              .eq("player_id", player.id);
            const normPhone = (v: string | null | undefined) => (v ?? "").replace(/[^0-9+]/g, "");
            const parentKey = (opts: {
              email: string | null;
              phone: string | null;
              fullName: string | null;
            }): string | null => {
              const e = (opts.email ?? "").trim().toLowerCase();
              if (e) return `e:${e}`;
              const p = normPhone(opts.phone);
              if (p) return `p:${p}`;
              const n = normalizeName(opts.fullName);
              if (n) return `n:${n}`;
              return null;
            };
            const seenParentKeys = new Set<string>();
            for (const ep of existingParents ?? []) {
              const k = parentKey({
                email: (ep as { email: string | null }).email,
                phone: (ep as { phone: string | null }).phone,
                fullName: (ep as { full_name: string | null }).full_name,
              });
              if (k) seenParentKeys.add(k);
            }

            for (const idx of [1, 2] as const) {
              const emailRaw = r[`email_parent_${idx}`];
              if (!emailRaw) continue;
              const email = emailRaw.trim().toLowerCase();
              const firstName = r[`prenom_parent_${idx}`] || "";
              const lastName = r[`nom_parent_${idx}`] || "";
              const phone = r[`telephone_parent_${idx}`] || null;
              const fullName = `${firstName} ${lastName}`.trim();
              const lien = r[`lien_parent_${idx}`] || null;

              const key = parentKey({ email, phone, fullName: fullName || null });
              if (key && seenParentKeys.has(key)) {
                // Déjà lié à ce joueur (import précédent ou parent 1 == parent 2)
                continue;
              }
              if (key) seenParentKeys.add(key);

              let parentUserId = parentCache.get(email) ?? null;
              if (!parentUserId) {
                parentUserId = await findOrCreateProfileByEmail(email, fullName);
                if (parentUserId) parentCache.set(email, parentUserId);
              }

              // Lien player ↔ parent (offline si parentUserId null)
              await supabaseAdmin.from("player_parents").insert({
                player_id: player.id,
                parent_user_id: parentUserId,
                full_name: fullName || null,
                email,
                phone,
              });
              parentsCreated++;

              if (parentUserId) {
                await supabaseAdmin.from("club_members").upsert(
                  {
                    club_id: data.clubId,
                    user_id: parentUserId,
                    role: "parent" as never,
                    roles: ["parent"] as never,
                  },
                  { onConflict: "club_id,user_id" } as never,
                );
              } else if (data.sendInvitations) {
                // Parent inconnu → invitation par email avec template Clubero
                const token = await createInviteAndEmail({
                  clubId: data.clubId,
                  clubName,
                  clubLogoUrl,
                  clubDefaultLanguage,
                  email,
                  firstName,
                  lastName,
                  phone,
                  role: "parent",
                  parentForPlayerId: player.id,
                  createdBy: context.userId,
                  roleLabel: "parent",
                  playerName: playerFullName,
                });
                if (token) invitationsSent++;
              }
              void lien; // lien_parent stocké via player_parents.full_name si besoin futur
            }
          } catch (e) {
            errors.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) });
          }
        }
        // A row "counts" as imported if it created/updated/restored a player
        // OR simply linked an already-existing player to a new team.
        imported = playersCreated + playersUpdated + playersRestored + playersLinked;
        summary.teams_created = teamsCreated;
        summary.players_created = playersCreated;
        summary.players_updated = playersUpdated;
        summary.players_restored = playersRestored;
        summary.players_linked = playersLinked;
        summary.parents_created = parentsCreated;
        summary.invitations_sent = invitationsSent;
      } else if (data.type === "coaches") {
        const teamCache = new Map<string, string>();
        const toCreate = new Set(data.teamsToCreate ?? []);
        let teamsCreated = 0;
        let coachesAdded = 0;
        let invitationsSent = 0;

        // Preload club teams for normalized dedupe (case/accents-insensitive) —
        // same contract as the players branch: override > normalized match >
        // explicit "create" opt-in > error. No implicit creation.
        const { data: clubTeamsList } = await supabaseAdmin
          .from("teams")
          .select("id, name, sport, age_group")
          .eq("club_id", data.clubId)
          .is("deleted_at", null);
        const teamsByNorm = new Map<string, string>();
        const normTeamKey = (name: string, sport: string | null, cat: string | null) =>
          `${normalizeName(name)}|${normalizeName(sport)}|${normalizeName(cat)}`;
        for (const t of clubTeamsList ?? []) {
          teamsByNorm.set(normTeamKey(t.name, t.sport, t.age_group), t.id);
        }

        for (let i = 0; i < data.rows.length; i++) {
          const r = data.rows[i] as RowMap;
          try {
            const resolution = resolveTeamForRow({
              equipe: r.equipe,
              sport: r.sport,
              categorie: r.categorie,
              teamOverrides: data.teamOverrides,
              teamsToCreate: toCreate,
              teamsByNorm,
            });
            let teamId: string;
            const teamKey =
              resolution.kind === "error"
                ? `${r.equipe}|${r.sport}|${r.categorie}`
                : resolution.teamKey;
            const cached = teamCache.get(teamKey);
            if (cached) {
              teamId = cached;
            } else if (resolution.kind === "override" || resolution.kind === "matched") {
              teamId = resolution.teamId;
              teamCache.set(teamKey, teamId);
            } else if (resolution.kind === "create") {
              const { data: inserted, error: cErr } = await supabaseAdmin
                .from("teams")
                .insert({
                  club_id: data.clubId,
                  name: r.equipe!,
                  sport: r.sport!,
                  age_group: r.categorie!,
                  season: r.saison,
                  championship: r.genre,
                })
                .select("id")
                .single();
              if (cErr) throw new Error(`Création équipe ${r.equipe}: ${cErr.message}`);
              teamId = inserted.id;
              teamsByNorm.set(normTeamKey(r.equipe!, r.sport!, r.categorie!), teamId);
              teamCache.set(teamKey, teamId);
              teamsCreated++;
            } else {
              throw new Error(resolution.message);
            }

            const email = r.email!.toLowerCase();
            const firstName = titleCase(r.prenom!);
            const lastName = titleCase(r.nom!);

            const roleEnumPre = r.role === "manager" ? "dirigeant" : "coach";
            const userId = await findOrCreateProfileByEmail(email, `${firstName} ${lastName}`);

            if (!userId) {
              // Pas d'utilisateur existant → invitation member_invites + email
              const token = data.sendInvitations
                ? await createInviteAndEmail({
                    clubId: data.clubId,
                    clubName,
                    clubLogoUrl,
                    clubDefaultLanguage,
                    teamId,
                    email,
                    firstName,
                    lastName,
                    phone: r.telephone,
                    role: roleEnumPre as "coach" | "dirigeant",
                    createdBy: context.userId,
                    roleLabel: r.role || "coach",
                  })
                : null;
              if (token) invitationsSent++;
              else {
                // Pas d'envoi → on enregistre l'invite offline pour récupération ultérieure
                const offlineToken = crypto.randomUUID().replace(/-/g, "");
                await supabaseAdmin.from("member_invites").insert({
                  club_id: data.clubId,
                  team_id: teamId,
                  role: roleEnumPre as never,
                  email,
                  first_name: firstName,
                  last_name: lastName,
                  phone: r.telephone || null,
                  token: offlineToken,
                  created_by: context.userId,
                });
              }
              coachesAdded++;
              continue;
            }

            const roleEnum = roleEnumPre;
            await supabaseAdmin.from("club_members").upsert(
              {
                club_id: data.clubId,
                user_id: userId,
                role: roleEnum as never,
                roles: [r.role!] as never,
              },
              { onConflict: "club_id,user_id" } as never,
            );
            await supabaseAdmin.from("team_members").insert({
              team_id: teamId,
              user_id: userId,
              role: roleEnum as never,
            });
            if (r.numero_licence) {
              await supabaseAdmin
                .from("coach_profiles")
                .upsert(
                  { user_id: userId, license_number: r.numero_licence } as never,
                  { onConflict: "user_id" } as never,
                );
            }
            coachesAdded++;
          } catch (e) {
            errors.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) });
          }
        }
        imported = coachesAdded;
        summary.teams_created = teamsCreated;
        summary.coaches_added = coachesAdded;
        summary.invitations_sent = invitationsSent;
      } else {
        // planning
        let eventsCreated = 0;
        for (let i = 0; i < data.rows.length; i++) {
          const r = data.rows[i] as RowMap;
          try {
            // Recherche équipe (pas de création auto)
            const { data: team } = await supabaseAdmin
              .from("teams")
              .select("id")
              .eq("club_id", data.clubId)
              .eq("name", r.equipe!)
              .is("deleted_at", null)
              .maybeSingle();
            if (!team) {
              throw new Error(`Équipe inconnue : ${r.equipe}`);
            }

            const typeMap: Record<string, string> = {
              Entraînement: "training",
              Match: "match",
              Tournoi: "tournament",
              Réunion: "meeting",
            };
            const evType = typeMap[r.type!] ?? "other";
            const title = r.titre || `${r.type} ${r.equipe}`;

            const dates: Date[] =
              r.recurrence_jours && r.recurrence_fin
                ? expandOccurrences(
                    r.date_debut!,
                    r.recurrence_jours
                      .split(/[,;]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                    r.recurrence_fin,
                  )
                : [new Date(`${r.date_debut}T${r.heure_debut}:00`)];

            for (const d of dates) {
              const [h, m] = r.heure_debut!.split(":").map(Number);
              const starts = new Date(d);
              starts.setUTCHours(h, m, 0, 0);
              let ends: Date;
              if (r.heure_fin) {
                const [eh, em] = r.heure_fin.split(":").map(Number);
                ends = new Date(starts);
                ends.setUTCHours(eh, em, 0, 0);
                if (ends.getTime() <= starts.getTime())
                  ends = new Date(starts.getTime() + 90 * 60_000);
              } else {
                ends = new Date(starts.getTime() + 90 * 60_000);
              }
              const { error } = await supabaseAdmin.from("events").insert({
                team_id: team.id,
                title,
                type: evType as never,
                status: "draft" as never,
                starts_at: starts.toISOString(),
                ends_at: ends.toISOString(),
                location: r.lieu || null,
                opponent: r.adversaire || null,
                is_home:
                  r.domicile === "Domicile" ? true : r.domicile === "Extérieur" ? false : null,
                created_by: context.userId,
              });
              if (error) throw new Error(error.message);
              eventsCreated++;
            }
          } catch (e) {
            errors.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) });
          }
        }
        imported = eventsCreated;
        summary.events_created = eventsCreated;
      }
    } catch (e) {
      log.error("import fatal", { error: String(e) });
      const { data: fatalRun } = await supabaseAdmin
        .from("superadmin_imports")
        .insert({
          club_id: data.clubId,
          imported_by: context.userId,
          import_type: data.type,
          file_name: data.fileName ?? null,
          rows_total: data.rows.length,
          rows_imported: 0,
          ia_used: data.iaUsed,
          invitations_sent: data.sendInvitations,
          status: "failed",
          error_log: { fatal: String(e) } as never,
        })
        .select("id")
        .single();
      void logActivity(supabaseAdmin, {
        clubId: data.clubId,
        actorUserId: context.userId,
        category: "import",
        actionType: "import.failed",
        resourceType: "import",
        resourceId: fatalRun?.id ?? null,
        status: "failure",
        errorCode: "import_fatal",
        metadata: {
          type: data.type,
          imported: 0,
          failed: data.rows.length,
          error: redactErrorMessage(e),
        },
      });
      throw e;
    }

    const status = errors.length === 0 ? "success" : imported > 0 ? "partial" : "failed";
    const { data: runRow } = await supabaseAdmin
      .from("superadmin_imports")
      .insert({
        club_id: data.clubId,
        imported_by: context.userId,
        import_type: data.type,
        file_name: data.fileName ?? null,
        rows_total: data.rows.length,
        rows_imported: imported,
        ia_used: data.iaUsed,
        invitations_sent: data.sendInvitations,
        status,
        error_log: errors.length ? ({ errors } as never) : null,
      })
      .select("id")
      .single();

    const actionType =
      status === "success"
        ? "import.succeeded"
        : status === "partial"
          ? "import.partial"
          : "import.failed";
    const activityStatus =
      status === "success" ? "success" : status === "partial" ? "warning" : "failure";
    void logActivity(supabaseAdmin, {
      clubId: data.clubId,
      actorUserId: context.userId,
      category: "import",
      actionType,
      resourceType: "import",
      resourceId: runRow?.id ?? null,
      status: activityStatus,
      errorCode: status === "failed" ? "import_no_rows" : null,
      metadata: {
        type: data.type,
        imported,
        failed: errors.length,
        ...(errors.length ? { error: redactErrorMessage({ errors: errors.slice(0, 3) }) } : {}),
      },
    });

    return { status, imported, total: data.rows.length, errors, summary };
  });

// ============================================================
// 6) Preview import players — team resolutions + per-row diffs
// ============================================================

export type PlayerImportPreview = {
  fixedTeam: { id: string; name: string; sport: string | null; age_group: string | null } | null;
  teamResolutions: Array<{
    key: string;
    name: string;
    sport: string;
    category: string;
    suggestedTeamId: string | null;
    existingTeams: Array<{
      id: string;
      name: string;
      sport: string | null;
      age_group: string | null;
    }>;
  }>;
  rowPreviews: Array<{
    index: number;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    action: "new" | "update" | "restore";
    existingId: string | null;
    teamKey: string | null;
    diffs: Array<{
      field: string;
      current: string | null;
      incoming: string | null;
      overwritable: boolean;
    }>;
  }>;
  summary: { new: number; update: number; restore: number };
};

export const previewPlayersImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        teamId: z.string().uuid().optional(),
        rows: importRowsSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PlayerImportPreview> => {
    await assertImportAccess(context.supabase, context.userId, data.clubId);

    let fixedTeam: PlayerImportPreview["fixedTeam"] = null;
    if (data.teamId) {
      const { data: t } = await supabaseAdmin
        .from("teams")
        .select("id, club_id, name, sport, age_group")
        .eq("id", data.teamId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!t || t.club_id !== data.clubId) throw new Response("Forbidden", { status: 403 });
      fixedTeam = { id: t.id, name: t.name, sport: t.sport, age_group: t.age_group };
    }

    type ExistingPlayer = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      birth_date: string | null;
      jersey_number: number | null;
      license_number: string | null;
      preferred_position: string | null;
      email: string | null;
      phone: string | null;
      deleted_at: string | null;
    };

    const { data: roster, error: rosterErr } = await supabaseAdmin
      .from("players")
      .select(
        "id, first_name, last_name, birth_date, jersey_number, license_number, preferred_position, email, phone, deleted_at",
      )
      .eq("club_id", data.clubId);
    if (rosterErr) throw new Error(rosterErr.message);

    const byIdentity = new Map<string, ExistingPlayer>();
    const key = (f: string | null, l: string | null, b: string | null) => {
      if (!b) return null;
      const nf = normalizeName(f);
      const nl = normalizeName(l);
      if (!nf || !nl) return null;
      return `${nf}|${nl}|${b}`;
    };
    for (const p of (roster ?? []) as ExistingPlayer[]) {
      const k = key(p.first_name, p.last_name, p.birth_date);
      if (!k) continue;
      const prev = byIdentity.get(k);
      if (!prev || (prev.deleted_at && !p.deleted_at)) byIdentity.set(k, p);
    }

    const { data: clubTeams } = await supabaseAdmin
      .from("teams")
      .select("id, name, sport, age_group")
      .eq("club_id", data.clubId)
      .is("deleted_at", null);
    const teamList = clubTeams ?? [];

    const teamTuples = new Map<string, PlayerImportPreview["teamResolutions"][number]>();
    const summary = { new: 0, update: 0, restore: 0 };

    const rowPreviews: PlayerImportPreview["rowPreviews"] = data.rows.map((r, i) => {
      const row = r as RowMap;
      let teamKey: string | null = null;
      if (!fixedTeam && row.equipe && row.sport && row.categorie) {
        teamKey = `${row.equipe}|${row.sport}|${row.categorie}`;
        if (!teamTuples.has(teamKey)) {
          // Normalized (unaccent + lowercase + strip non-alnum) match — dedupes
          // casse/accents differences so "U13 F" and "u13-f" resolve to the
          // same team instead of proposing "create" again.
          const targetNorm = `${normalizeName(row.equipe)}|${normalizeName(row.sport)}|${normalizeName(row.categorie)}`;
          const matched = teamList.find(
            (t) =>
              `${normalizeName(t.name)}|${normalizeName(t.sport)}|${normalizeName(t.age_group)}` ===
              targetNorm,
          );
          teamTuples.set(teamKey, {
            key: teamKey,
            name: row.equipe,
            sport: row.sport,
            category: row.categorie,
            suggestedTeamId: matched?.id ?? null,
            existingTeams: teamList,
          });
        }
      }
      const firstName = titleCase(row.prenom_joueur ?? "");
      const lastName = titleCase(row.nom_joueur ?? "");
      const idKey = key(firstName, lastName, row.date_naissance ?? null);
      const existing = idKey ? (byIdentity.get(idKey) ?? null) : null;
      let action: "new" | "update" | "restore" = "new";
      const diffs: PlayerImportPreview["rowPreviews"][number]["diffs"] = [];
      if (existing) {
        action = existing.deleted_at ? "restore" : "update";
        const incomingMap: Record<string, string | null> = {
          first_name: firstName || null,
          last_name: lastName || null,
          jersey_number: row.numero_maillot || null,
          license_number: row.numero_licence || null,
          preferred_position: row.poste || null,
          email: row.email_contact ? row.email_contact.toLowerCase() : null,
          phone: row.telephone_joueur || null,
        };
        const currentMap: Record<string, string | null> = {
          first_name: existing.first_name,
          last_name: existing.last_name,
          jersey_number: existing.jersey_number != null ? String(existing.jersey_number) : null,
          license_number: existing.license_number,
          preferred_position: existing.preferred_position,
          email: existing.email,
          phone: existing.phone,
        };
        for (const f of PLAYER_OVERWRITABLE_FIELDS) {
          const inc = incomingMap[f];
          const cur = currentMap[f];
          if (inc && inc !== cur) {
            diffs.push({
              field: f,
              current: cur,
              incoming: inc,
              overwritable: cur != null && cur !== "",
            });
          }
        }
      }
      summary[action]++;
      return {
        index: i,
        firstName: row.prenom_joueur ?? "",
        lastName: row.nom_joueur ?? "",
        birthDate: row.date_naissance ?? null,
        action,
        existingId: existing?.id ?? null,
        teamKey,
        diffs,
      };
    });

    return {
      fixedTeam,
      teamResolutions: Array.from(teamTuples.values()),
      rowPreviews,
      summary,
    };
  });
