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
import {
  type AnalysisResult,
  type ImportType,
  ENTITY_MAX_ROWS,
  PLANNING_MAX_ROWS,
  RECURRENCE_OCCURRENCE_CAP,
  getFields,
} from "./schemas";
import { parseTemplate } from "./template-parse";

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
- Exemples : "first name" → prenom, "DOB" → date_naissance, "team" → equipe, "category" → categorie, "phone" → telephone.`;

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

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const mapping: Record<string, string> = {};
    try {
      const { object } = await generateObject({
        model,
        schema: aiMappingSchema,
        system: SYSTEM_PROMPT,
        prompt: `Type d'import : ${data.type}
Clés Clubero valides : ${fieldList}

En-têtes source du fichier :
${JSON.stringify(headers)}

Échantillon des 3 premières lignes (pour aider la désambiguïsation) :
${JSON.stringify(rawRows.slice(0, 3))}

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
      throw new Error(
        "L'analyse IA n'a pas réussi à mapper les colonnes. Vérifie que le fichier contient des en-têtes lisibles ou utilise le modèle Clubero.",
      );
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
  try {
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error: invErr } = await supabaseAdmin.from("member_invites").insert({
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
    } as never);
    if (invErr) {
      log.warn("member_invites insert failed", { email: params.email, error: invErr.message });
      return null;
    }

    const inviteUrl = `https://clubero.app/register?invite=${encodeURIComponent(token)}`;
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/send.server");
    await enqueueTransactionalEmailServer({
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
      },
    });
    return token;
  } catch (e) {
    log.warn("invite+email failed", { email: params.email, error: String(e) });
    return null;
  }
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertImportAccess(context.supabase, context.userId, data.clubId);

    // If a teamId is provided, verify it belongs to the club (defense in depth).
    let fixedTeam:
      | { id: string; name: string; sport: string | null; age_group: string | null }
      | null = null;
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
      .select("name, logo_url")
      .eq("id", data.clubId)
      .maybeSingle();
    const clubName = clubRow?.name ?? undefined;
    const clubLogoUrl = clubRow?.logo_url ?? undefined;

    try {
      if (data.type === "players") {
        const teamCache = new Map<string, string>();
        const parentCache = new Map<string, string>();
        let teamsCreated = 0;
        let playersCreated = 0;
        let playersUpdated = 0;
        let playersRestored = 0;
        let parentsCreated = 0;
        let invitationsSent = 0;

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
        for (const p of (clubPlayers ?? []) as ExistingPlayer[]) {
          const k = identityKey(p.first_name, p.last_name, p.birth_date);
          if (!k) continue;
          const prev = playersByIdentity.get(k);
          if (!prev || (prev.deleted_at && !p.deleted_at)) playersByIdentity.set(k, p);
        }

        for (let i = 0; i < data.rows.length; i++) {
          const r = data.rows[i] as RowMap;
          try {
            // DOB mandatory — identity key requires it.
            if (!r.date_naissance) {
              throw new Error("date de naissance requise");
            }

            // Resolve team: fixed team (coach mode) or per-row.
            let teamId: string;
            if (fixedTeam) {
              teamId = fixedTeam.id;
            } else {
              const teamKey = `${r.equipe}|${r.sport}|${r.categorie}`;
              const cached = teamCache.get(teamKey);
              if (cached) {
                teamId = cached;
              } else {
                const t = await findOrCreateTeam(
                  data.clubId,
                  r.equipe!,
                  r.sport!,
                  r.categorie!,
                  r.genre,
                  r.saison,
                );
                teamId = t.id;
                teamCache.set(teamKey, teamId);
                if (t.created) teamsCreated++;
              }
            }

            const firstName = titleCase(r.prenom_joueur!);
            const lastName = titleCase(r.nom_joueur!);
            const idKey = identityKey(firstName, lastName, r.date_naissance)!;

            let existing = playersByIdentity.get(idKey) ?? null;
            let playerId: string;

            if (existing && existing.deleted_at) {
              const { error: restoreErr } = await supabaseAdmin.rpc(
                "restore_entity" as never,
                { _kind: "player", _id: existing.id } as never,
              );
              if (restoreErr) throw new Error(restoreErr.message);
              existing = { ...existing, deleted_at: null };
              playersRestored++;
            }

            if (existing) {
              // Non-destructive patch: only fill blanks.
              const patch: Record<string, unknown> = {};
              if (existing.jersey_number == null && r.numero_maillot)
                patch.jersey_number = parseInt(r.numero_maillot, 10);
              if (!existing.license_number && r.numero_licence)
                patch.license_number = r.numero_licence;
              if (!existing.preferred_position && r.poste) patch.preferred_position = r.poste;
              if (!existing.email && r.email_contact)
                patch.email = r.email_contact.toLowerCase();
              if (!existing.phone && r.telephone_joueur) patch.phone = r.telephone_joueur;
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
                  jersey_number: r.numero_maillot ? parseInt(r.numero_maillot, 10) : null,
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
              playerId = inserted.id;
            }

            // Link team_members if missing (ignore duplicate errors).
            const { error: tmErr } = await supabaseAdmin.from("team_members").insert({
              team_id: teamId,
              player_id: playerId,
              role: "player" as never,
            });
            if (tmErr && (tmErr as { code?: string }).code !== "23505") {
              throw new Error(tmErr.message);
            }

            const player = { id: playerId };


            const playerFullName =
              `${titleCase(r.prenom_joueur!)} ${titleCase(r.nom_joueur!)}`.trim();

            // Invitation joueur (si email fourni et option activée)
            if (r.email_contact && data.sendInvitations) {
              const token = await createInviteAndEmail({
                clubId: data.clubId,
                clubName,
                clubLogoUrl,
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

            // Parents
            for (const idx of [1, 2] as const) {
              const email = r[`email_parent_${idx}`];
              if (!email) continue;
              const firstName = r[`prenom_parent_${idx}`] || "";
              const lastName = r[`nom_parent_${idx}`] || "";
              const phone = r[`telephone_parent_${idx}`] || null;
              const fullName = `${firstName} ${lastName}`.trim();
              const lien = r[`lien_parent_${idx}`] || null;

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
        imported = playersCreated;
        summary.teams_created = teamsCreated;
        summary.players_created = playersCreated;
        summary.parents_created = parentsCreated;
        summary.invitations_sent = invitationsSent;
      } else if (data.type === "coaches") {
        const teamCache = new Map<string, string>();
        let teamsCreated = 0;
        let coachesAdded = 0;
        let invitationsSent = 0;

        for (let i = 0; i < data.rows.length; i++) {
          const r = data.rows[i] as RowMap;
          try {
            const teamKey = `${r.equipe}|${r.sport}|${r.categorie}`;
            let teamId = teamCache.get(teamKey);
            if (!teamId) {
              const t = await findOrCreateTeam(
                data.clubId,
                r.equipe!,
                r.sport!,
                r.categorie!,
                r.genre,
                r.saison,
              );
              teamId = t.id;
              teamCache.set(teamKey, teamId);
              if (t.created) teamsCreated++;
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
      await supabaseAdmin.from("superadmin_imports").insert({
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
      });
      throw e;
    }

    const status = errors.length === 0 ? "success" : imported > 0 ? "partial" : "failed";
    await supabaseAdmin.from("superadmin_imports").insert({
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
    });

    return { status, imported, total: data.rows.length, errors, summary };
  });
