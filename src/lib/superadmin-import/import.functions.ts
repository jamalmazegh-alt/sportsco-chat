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
      .order("name")
      .limit(20);
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
      supabaseAdmin.from("teams").select("id", { count: "exact", head: true }).eq("club_id", data.clubId).is("deleted_at", null),
      supabaseAdmin.from("players").select("id", { count: "exact", head: true }).eq("club_id", data.clubId).is("deleted_at", null),
      supabaseAdmin.from("club_members").select("user_id", { count: "exact", head: true }).eq("club_id", data.clubId).contains("roles", ["coach"]),
      supabaseAdmin.from("superadmin_imports").select("id, created_at, import_type, status, rows_imported, file_name").eq("club_id", data.clubId).order("created_at", { ascending: false }).limit(10),
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
      field: z.string().describe("Clé Clubero cible, ou 'ignore' si la colonne n'a pas d'équivalent"),
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
        type: z.enum(["players", "coaches", "planning"]),
        headers: z.array(z.string()).min(1).max(50),
        rawRows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY non configurée");

    const fields = getFields(data.type);
    const validKeys = new Set(fields.map((f) => f.key));
    const fieldList = fields
      .map((f) => `${f.key} (${f.required ? "obligatoire" : "optionnel"})`)
      .join(", ");

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    // 1) Demande IA : seulement le mapping (petit, fiable)
    let mapping: Record<string, string> = {};
    try {
      const { object } = await generateObject({
        model,
        schema: aiMappingSchema,
        system: SYSTEM_PROMPT,
        prompt: `Type d'import : ${data.type}
Clés Clubero valides : ${fieldList}

En-têtes source du fichier :
${JSON.stringify(data.headers)}

Échantillon des 3 premières lignes (pour aider la désambiguïsation) :
${JSON.stringify(data.rawRows.slice(0, 3))}

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

    // 2) Renomme les en-têtes du dataset selon le mapping IA, puis applique parseTemplate
    //    (toute la normalisation/validation locale s'applique).
    const renamedHeaders = data.headers.map((h) => mapping[h] ?? h);
    const renamedRows = data.rawRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        const target = mapping[k];
        if (target) out[target] = v;
      }
      return out;
    });

    const parsed = parseTemplate(data.type, renamedHeaders, renamedRows);
    // Conserve le mapping IA dans le résultat final pour traçabilité
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
        type: z.enum(["players", "coaches", "planning"]),
        headers: z.array(z.string()).min(1).max(50),
        rawRows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    return parseTemplate(data.type, data.headers, data.rawRows);
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

function expandOccurrences(
  dateDebut: string,
  daysFr: string[],
  fin: string,
): Date[] {
  const dayMap: Record<string, number> = {
    Dimanche: 0, Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6,
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
  const { data: rpc } = await supabaseAdmin.rpc("email_exists" as never, { _email: email } as never);
  if (rpc && typeof rpc === "object" && "user_id" in (rpc as object)) {
    const userId = (rpc as { user_id: string }).user_id;
    if (userId) return userId;
  }
  // Pas de profil → on n'a pas le droit d'insérer dans auth.users sans inviteUserByEmail
  // → renvoie null, le caller décidera (invite Supabase Auth ou skip)
  return null;
}

async function inviteUserByEmail(
  email: string,
  firstName: string,
  lastName: string,
  context?: {
    clubName?: string;
    inviteRole?: string;
    playerName?: string;
    inviterName?: string;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
        // Contexte lu par le template auth InviteEmail via user_metadata
        club_name: context?.clubName,
        invite_role: context?.inviteRole,
        player_name: context?.playerName,
        inviter_name: context?.inviterName,
      },
    });
    if (error) {
      log.warn("invite failed", { email, error: error.message });
      return null;
    }
    return data.user?.id ?? null;
  } catch (e) {
    log.warn("invite threw", { email, error: String(e) });
    return null;
  }
}

export const runImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        type: z.enum(["players", "coaches", "planning"]),
        rows: importRowsSchema,
        sendInvitations: z.boolean().default(false),
        fileName: z.string().max(255).optional(),
        iaUsed: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

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
      .select("name")
      .eq("id", data.clubId)
      .maybeSingle();
    const clubName = clubRow?.name ?? undefined;



    try {
      if (data.type === "players") {
        const teamCache = new Map<string, string>();
        const parentCache = new Map<string, string>();
        let teamsCreated = 0;
        let playersCreated = 0;
        let parentsCreated = 0;
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

            const { data: player, error: pErr } = await supabaseAdmin
              .from("players")
              .insert({
                club_id: data.clubId,
                first_name: titleCase(r.prenom_joueur!),
                last_name: titleCase(r.nom_joueur!),
                birth_date: r.date_naissance,
                jersey_number: r.numero_maillot ? parseInt(r.numero_maillot, 10) : null,
                position: r.poste || null,
                email: r.email_contact?.toLowerCase() || null,
              })
              .select("id")
              .single();
            if (pErr) throw new Error(pErr.message);
            playersCreated++;

            await supabaseAdmin.from("team_members").insert({
              team_id: teamId,
              player_id: player.id,
              role: "player" as never,
            });

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
                if (!parentUserId && data.sendInvitations) {
                  parentUserId = await inviteUserByEmail(email, firstName, lastName, {
                    clubName,
                    inviteRole: "parent",
                    playerName: `${titleCase(r.prenom_joueur!)} ${titleCase(r.nom_joueur!)}`.trim(),
                  });
                  if (parentUserId) invitationsSent++;
                }
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
                await supabaseAdmin
                  .from("club_members")
                  .upsert(
                    {
                      club_id: data.clubId,
                      user_id: parentUserId,
                      role: "parent" as never,
                      roles: ["parent"] as never,
                    },
                    { onConflict: "club_id,user_id" } as never,
                  );
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

            let userId = await findOrCreateProfileByEmail(email, `${firstName} ${lastName}`);
            if (!userId && data.sendInvitations) {
              userId = await inviteUserByEmail(email, firstName, lastName, {
                clubName,
                inviteRole: r.role || "coach",
              });
              if (userId) invitationsSent++;
            }

            if (!userId) {
              // Pas d'invitation demandée → on enregistre l'invite offline
              const token = crypto.randomUUID().replace(/-/g, "");
              await supabaseAdmin.from("member_invites").insert({
                club_id: data.clubId,
                team_id: teamId,
                role: "coach" as never,
                email,
                first_name: firstName,
                last_name: lastName,
                phone: r.telephone || null,
                token,
                created_by: context.userId,
              });
              coachesAdded++;
              continue;
            }

            // Map role : assistant_coach/manager → enum app_role
            const roleEnum =
              r.role === "manager" ? "dirigeant" : "coach";
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
              "Entraînement": "training",
              "Match": "match",
              "Tournoi": "tournament",
              "Réunion": "meeting",
            };
            const evType = typeMap[r.type!] ?? "other";
            const title = r.titre || `${r.type} ${r.equipe}`;

            const dates: Date[] = r.recurrence_jours && r.recurrence_fin
              ? expandOccurrences(
                  r.date_debut!,
                  r.recurrence_jours.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
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
                if (ends.getTime() <= starts.getTime()) ends = new Date(starts.getTime() + 90 * 60_000);
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
                is_home: r.domicile === "Domicile" ? true : r.domicile === "Extérieur" ? false : null,
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
