import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

type ChatRequestBody = { messages?: unknown };

const SYSTEM_PROMPT = `Tu es l'assistant officiel de Clubero, une application de gestion de club sportif amateur.
Tu aides les utilisateurs (joueurs, parents, coaches, dirigeants, admins) à comprendre comment utiliser l'app et à consulter leurs données personnelles.

Règles importantes :
- Réponds toujours dans la langue de l'utilisateur (français par défaut, sinon adapte-toi).
- Sois concis, chaleureux et précis. Pas de jargon technique inutile.
- Pour répondre à des questions sur les données, utilise les tools fournis. Ne devine jamais — si tu n'as pas la donnée, dis-le.
- Si un tool renvoie une liste vide ou un champ "note", explique simplement la situation à l'utilisateur (ex : "tu n'as pas de joueur lié à ton compte, donc il n'y a pas de stats de présence à afficher pour toi"). Ne dis JAMAIS "non autorisé", "unauthorized", "accès refusé" ou "erreur" dans ce cas — il s'agit simplement d'une absence de données pertinentes pour ce profil.
- Ne propose les outils réservés aux coachs/admins (\`getPendingResponsesForCoach\`, \`sendConvocationReminders\`, \`createDraftEvent\`) que si l'utilisateur est effectivement coach ou admin d'une équipe, OU admin/dirigeant du club. Pour un joueur ou un parent simple, ne mentionne pas ces fonctions et redirige vers le coach.
- Pour les coachs/admins : tu peux lister les joueurs qui n'ont pas encore répondu à une convocation avec \`getPendingResponsesForCoach\`. Si l'utilisateur te demande de relancer ces joueurs, **demande TOUJOURS confirmation explicite avant d'appeler \`sendConvocationReminders\`** ("Veux-tu que je leur envoie un rappel ?"). N'appelle ce tool qu'après un "oui" clair. Pour joueurs/parents qui te demandent de relancer un coach, redirige vers le contact direct du coach.
- Création d'événement (\`createDraftEvent\`, coachs/admins seulement) : avant d'appeler, vérifie que tu as l'équipe, le titre, le type (entraînement / match / tournoi / réunion / autre) et la date/heure précise. Convertis les dates relatives ("samedi prochain 14h30") en ISO complet avec fuseau horaire avant l'appel. Si l'utilisateur mentionne une **heure de rendez-vous** distincte de l'heure de début, passe-la dans \`convocationTime\` (pas dans la description). Si l'utilisateur mentionne un **point de ralliement / lieu de RDV** distinct du lieu de l'événement, passe-le dans \`meetingPoint\` (et le lieu du match/entraînement dans \`location\`). N'inclus jamais l'heure de RDV ou le point de ralliement uniquement dans \`description\`. **Récapitule ce que tu vas créer et demande une confirmation explicite ("Je crée ce brouillon ?") avant l'appel.** L'événement est créé en BROUILLON — précise ensuite à l'utilisateur qu'il doit l'ouvrir (lien fourni), sélectionner les convoqués et cliquer "Publier" pour envoyer les convocations.
- Tu peux expliquer les fonctionnalités : convocations (présent/absent/incertain, avec motif), partage de convocations sur WhatsApp en 1 clic (option : Clubero structure, WhatsApp diffuse — les réponses restent suivies dans l'app), mur du club avec @mentions, posts épinglés, accusés de lecture et pièces jointes, chat d'événement temps réel, résultats de matchs avec stats joueurs par sport, statistiques de présence, recherche globale (Cmd/Ctrl + K), exports CSV, corbeille 7 jours, notifications in-app/email/WhatsApp, codes d'invitation, gestion multi-saisons, rôles, RGPD/droit à l'image.
- Si la question est hors-sujet (politique, conseils médicaux, etc.), redirige poliment vers le sujet de l'app.
- Format : utilise Markdown (listes, gras) pour la lisibilité, mais reste bref.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length);
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsRes, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claimsRes?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claimsRes.claims.sub as string;

        // Helper: resolve player ids the user can act on (own + children)
        async function getMyPlayerIds(): Promise<string[]> {
          const [{ data: own }, { data: parents }] = await Promise.all([
            supabase.from("players").select("id").eq("user_id", userId),
            supabase.from("player_parents").select("player_id").eq("parent_user_id", userId),
          ]);
          const ids = new Set<string>();
          (own ?? []).forEach((p) => ids.add(p.id));
          (parents ?? []).forEach((p) => ids.add(p.player_id));
          return Array.from(ids);
        }

        // Helper: list team ids the user can manage (team coach/admin OR club admin/dirigeant)
        async function getManagedTeamIds(): Promise<string[]> {
          const [{ data: tm }, { data: cm }] = await Promise.all([
            supabase
              .from("team_members")
              .select("team_id")
              .eq("user_id", userId)
              .in("role", ["coach", "admin"]),
            supabase
              .from("club_members")
              .select("club_id, role")
              .eq("user_id", userId)
              .in("role", ["admin", "dirigeant"]),
          ]);
          const ids = new Set<string>();
          (tm ?? []).forEach((r: any) => ids.add(r.team_id));
          const clubIds = (cm ?? []).map((r: any) => r.club_id);
          if (clubIds.length > 0) {
            const { data: clubTeams } = await supabase
              .from("teams")
              .select("id")
              .in("club_id", clubIds);
            (clubTeams ?? []).forEach((t: any) => ids.add(t.id));
          }
          return Array.from(ids);
        }

        const tools = {
          getMyProfile: tool({
            description: "Récupère le profil de l'utilisateur connecté : nom, langue, clubs et rôles.",
            inputSchema: z.object({}),
            execute: async () => {
              const [{ data: profile }, { data: memberships }] = await Promise.all([
                supabase
                  .from("profiles")
                  .select("full_name, first_name, last_name, preferred_language, phone")
                  .eq("id", userId)
                  .maybeSingle(),
                supabase
                  .from("club_members")
                  .select("role, clubs:club_id(name)")
                  .eq("user_id", userId),
              ]);
              return {
                profile,
                clubs: (memberships ?? []).map((m: any) => ({
                  name: m.clubs?.name,
                  role: m.role,
                })),
              };
            },
          }),

          getMyUpcomingEvents: tool({
            description:
              "Liste les prochains événements (entraînements, matchs) auxquels l'utilisateur ou ses enfants sont convoqués, avec leur statut de réponse.",
            inputSchema: z.object({
              limit: z.number().int().min(1).max(20).optional(),
            }),
            execute: async ({ limit = 10 }) => {
              const playerIds = await getMyPlayerIds();
              if (playerIds.length === 0) return { events: [] };
              const { data } = await supabase
                .from("convocations")
                .select(
                  "status, player_id, event:event_id(id, title, type, starts_at, location, opponent, status, team:team_id(name))"
                )
                .in("player_id", playerIds)
                .order("created_at", { ascending: false });
              const now = new Date();
              const events = (data ?? [])
                .filter((c: any) => c.event && c.event.status === "published" && new Date(c.event.starts_at) >= now)
                .map((c: any) => ({
                  id: c.event.id,
                  title: c.event.title,
                  type: c.event.type,
                  starts_at: c.event.starts_at,
                  location: c.event.location,
                  opponent: c.event.opponent,
                  team: c.event.team?.name,
                  my_status: c.status,
                }))
                .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
                .slice(0, limit);
              return { events };
            },
          }),

          getMyAttendanceStats: tool({
            description:
              "Statistiques de présence aux entraînements pour l'utilisateur ou ses enfants : nombre total, présent, absent, en attente.",
            inputSchema: z.object({}),
            execute: async () => {
              const playerIds = await getMyPlayerIds();
              if (playerIds.length === 0) {
                return {
                  players: [],
                  note:
                    "Aucun joueur n'est associé à ce compte (ni en tant que joueur, ni en tant que parent). Les statistiques de présence ne s'appliquent donc pas à ce profil — par exemple un dirigeant ou un coach sans enfant inscrit.",
                };
              }
              const { data: players } = await supabase
                .from("players")
                .select("id, first_name, last_name")
                .in("id", playerIds);
              const { data: convs } = await supabase
                .from("convocations")
                .select("player_id, status, event:event_id(type, status, starts_at)")
                .in("player_id", playerIds);
              const now = Date.now();
              const byPlayer = new Map<string, { present: number; absent: number; uncertain: number; pending: number; total: number }>();
              for (const c of convs ?? []) {
                const ev = (c as any).event;
                if (!ev || ev.status !== "published" || ev.type !== "training") continue;
                if (new Date(ev.starts_at).getTime() > now) continue; // past trainings only
                const stats =
                  byPlayer.get(c.player_id) ?? { present: 0, absent: 0, uncertain: 0, pending: 0, total: 0 };
                stats.total += 1;
                if (c.status === "present") stats.present += 1;
                else if (c.status === "absent") stats.absent += 1;
                else if (c.status === "uncertain") stats.uncertain += 1;
                else stats.pending += 1;
                byPlayer.set(c.player_id, stats);
              }
              return {
                players: (players ?? []).map((p) => {
                  const s = byPlayer.get(p.id) ?? { present: 0, absent: 0, uncertain: 0, pending: 0, total: 0 };
                  return {
                    name: `${p.first_name} ${p.last_name}`,
                    ...s,
                    attendance_rate:
                      s.total > 0 ? Math.round((s.present / s.total) * 100) + "%" : "—",
                  };
                }),
              };
            },
          }),

          getMyTeams: tool({
            description: "Liste les équipes auxquelles l'utilisateur (ou ses enfants) appartient.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data } = await supabase
                .from("team_members")
                .select("role, team:team_id(id, name, sport, age_group, season)")
                .or(`user_id.eq.${userId}`);
              const playerIds = await getMyPlayerIds();
              let extra: any[] = [];
              if (playerIds.length > 0) {
                const { data: kid } = await supabase
                  .from("team_members")
                  .select("role, team:team_id(id, name, sport, age_group, season), player_id")
                  .in("player_id", playerIds);
                extra = kid ?? [];
              }
              const all = [...(data ?? []), ...extra];
              const seen = new Set<string>();
              const teams = all
                .filter((t: any) => t.team && !seen.has(t.team.id) && seen.add(t.team.id))
                .map((t: any) => ({
                  name: t.team.name,
                  sport: t.team.sport,
                  age_group: t.team.age_group,
                  season: t.team.season,
                  role: t.role,
                }));
              return { teams };
            },
          }),

          getRecentClubAnnouncements: tool({
            description: "Récupère les dernières annonces du mur du club actif.",
            inputSchema: z.object({
              limit: z.number().int().min(1).max(10).optional(),
            }),
            execute: async ({ limit = 5 }) => {
              const { data: posts } = await supabase
                .from("wall_posts")
                .select("body, created_at, author:author_user_id(full_name)")
                .order("created_at", { ascending: false })
                .limit(limit);
              return {
                posts: (posts ?? []).map((p: any) => ({
                  body: p.body,
                  author: p.author?.full_name ?? "—",
                  created_at: p.created_at,
                })),
              };
            },
          }),

          getPendingResponsesForCoach: tool({
            description:
              "Pour coachs/admins uniquement : liste les événements à venir des équipes que l'utilisateur encadre, avec les joueurs convoqués qui n'ont PAS encore répondu (statut 'pending'). Permet de répondre à 'Qui n'a pas répondu pour samedi ?', 'Qui manque samedi ?', etc. Si l'utilisateur n'est ni coach ni admin, retourne une liste vide.",
            inputSchema: z.object({
              daysAhead: z.number().int().min(1).max(60).optional(),
            }),
            execute: async ({ daysAhead = 14 }) => {
              const teamIds = await getManagedTeamIds();
              if (teamIds.length === 0) {
                return {
                  events: [],
                  note: "L'utilisateur n'encadre aucune équipe (ni comme coach/admin d'équipe, ni comme admin/dirigeant de club) — cet outil ne s'applique pas à son profil.",
                };
              }
              const now = new Date();
              const horizon = new Date(now.getTime() + daysAhead * 86400000);
              const { data: events } = await supabase
                .from("events")
                .select("id, title, type, starts_at, opponent, team_id, team:team_id(name)")
                .in("team_id", teamIds)
                .eq("status", "published")
                .gte("starts_at", now.toISOString())
                .lte("starts_at", horizon.toISOString())
                .order("starts_at", { ascending: true });
              const eventIds = (events ?? []).map((e: any) => e.id);
              if (eventIds.length === 0) return { events: [] };
              const { data: pending } = await supabase
                .from("convocations")
                .select("id, event_id, player_id, players:player_id(first_name, last_name)")
                .in("event_id", eventIds)
                .eq("status", "pending");
              const byEvent = new Map<string, any[]>();
              for (const c of pending ?? []) {
                const p: any = (c as any).players ?? {};
                const arr = byEvent.get(c.event_id) ?? [];
                arr.push({
                  convocation_id: c.id,
                  player_id: c.player_id,
                  player_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—",
                });
                byEvent.set(c.event_id, arr);
              }
              return {
                events: (events ?? []).map((e: any) => ({
                  event_id: e.id,
                  title: e.title,
                  type: e.type,
                  starts_at: e.starts_at,
                  opponent: e.opponent,
                  team: e.team?.name,
                  pending_players: byEvent.get(e.id) ?? [],
                  pending_count: (byEvent.get(e.id) ?? []).length,
                })),
              };
            },
          }),

          sendConvocationReminders: tool({
            description:
              "Pour coachs/admins uniquement : envoie un rappel in-app aux joueurs/parents qui n'ont pas encore répondu à un événement donné. **N'utilise ce tool QU'APRÈS avoir demandé une confirmation explicite à l'utilisateur** (ex : 'Veux-tu que je leur envoie un rappel ?' → 'Oui'). Évite les doublons : ne relance pas un joueur déjà relancé dans les 30 dernières minutes. Retourne le nombre de rappels envoyés.",
            inputSchema: z.object({
              eventId: z.string().uuid().describe("ID de l'événement obtenu via getPendingResponsesForCoach"),
              playerIds: z
                .array(z.string().uuid())
                .optional()
                .describe("Optionnel : restreindre aux joueurs précis. Sinon, tous les pending de l'événement."),
            }),
            execute: async ({ eventId, playerIds }) => {
              const { data: ev } = await supabase
                .from("events")
                .select("id, title, team_id")
                .eq("id", eventId)
                .maybeSingle();
              if (!ev) return { sent: 0, note: "Événement introuvable." };
              const managedTeams = await getManagedTeamIds();
              if (!managedTeams.includes(ev.team_id)) {
                return {
                  sent: 0,
                  note: "L'utilisateur n'a pas les droits pour relancer sur cette équipe — relance refusée.",
                };
              }

              // Get pending convocations for this event
              let q = supabase
                .from("convocations")
                .select("id, player_id")
                .eq("event_id", eventId)
                .eq("status", "pending");
              if (playerIds && playerIds.length > 0) {
                q = q.in("player_id", playerIds);
              }
              const { data: convs } = await q;
              if (!convs || convs.length === 0) return { sent: 0, note: "Aucun joueur en attente." };

              let sent = 0;
              const skipped: string[] = [];
              for (const c of convs) {
                // Anti-spam: skip if reminded in last 30 min
                const { data: recent } = await supabase
                  .from("reminders")
                  .select("sent_at")
                  .eq("convocation_id", c.id)
                  .order("sent_at", { ascending: false })
                  .limit(1);
                if (
                  recent &&
                  recent[0] &&
                  Date.now() - new Date(recent[0].sent_at).getTime() < 30 * 60 * 1000
                ) {
                  skipped.push(c.player_id);
                  continue;
                }
                // Recipients: the player + parents
                const [{ data: parents }, { data: playerRow }] = await Promise.all([
                  supabase
                    .from("player_parents")
                    .select("parent_user_id")
                    .eq("player_id", c.player_id),
                  supabase
                    .from("players")
                    .select("user_id")
                    .eq("id", c.player_id)
                    .maybeSingle(),
                ]);
                const recipients = Array.from(
                  new Set([
                    ...(playerRow?.user_id ? [playerRow.user_id] : []),
                    ...((parents ?? [])
                      .map((p: any) => p.parent_user_id)
                      .filter(Boolean) as string[]),
                  ])
                );
                await supabase
                  .from("reminders")
                  .insert({ convocation_id: c.id, channel: "in_app", sent_by: userId });
                if (recipients.length > 0) {
                  await supabase.from("notifications").insert(
                    recipients.map((uid) => ({
                      user_id: uid,
                      type: "reminder",
                      title: ev.title,
                      body: "Merci de confirmer ta présence.",
                      link: `/events/${eventId}`,
                    }))
                  );
                }
                sent += 1;
              }
              return {
                sent,
                skipped_recently_reminded: skipped.length,
                note:
                  sent === 0
                    ? "Aucun rappel envoyé (tous les joueurs viennent d'être relancés)."
                    : `${sent} rappel(s) envoyé(s) avec succès.`,
              };
            },
          }),

          createDraftEvent: tool({
            description:
              "Pour coachs/admins uniquement : crée un événement (entraînement, match, tournoi, réunion) en BROUILLON pour une équipe encadrée par l'utilisateur. L'événement n'est PAS publié automatiquement — l'utilisateur doit le réviser et le publier dans la page Événements pour envoyer les convocations. **Demande TOUJOURS confirmation explicite avant d'appeler ce tool** (récapitule équipe, titre, type, date/heure et lieu, puis attends un 'oui' clair). Si l'utilisateur n'a pas précisé une info essentielle (équipe, date, heure), redemande-la avant d'appeler.",
            inputSchema: z.object({
              teamName: z.string().min(1).describe("Nom (ou portion) de l'équipe. Sera matché de façon flexible parmi les équipes encadrées."),
              title: z.string().min(1).max(200).describe("Titre de l'événement (ex : 'U13 vs FC Riverside', 'Entraînement hebdo')."),
              type: z.enum(["training", "match", "tournament", "meeting", "other"]),
              startsAt: z.string().describe("Date/heure de début au format ISO 8601 avec fuseau (ex : '2025-05-24T14:30:00+02:00'). Convertis toujours les indications relatives (samedi prochain 14h30) en ISO complet AVANT d'appeler."),
              endsAt: z.string().optional().describe("Date/heure de fin ISO 8601 (optionnel)."),
              convocationTime: z.string().optional().describe("Heure du rendez-vous (convocation) au format ISO 8601 avec fuseau. Renseigne-la dès que l'utilisateur mentionne une heure de RDV distincte (ex : RDV 11h00 pour un match à 12h30)."),
              location: z.string().max(200).optional().describe("Lieu de l'événement (ex : stade, gymnase)."),
              meetingPoint: z.string().max(200).optional().describe("Lieu du rendez-vous / point de ralliement (ex : 'Parking du club', 'Devant le vestiaire'). Distinct du lieu de l'événement."),
              opponent: z.string().max(200).optional().describe("Pour les matchs uniquement."),
              description: z.string().max(1000).optional(),
            }),
            execute: async ({ teamName, title, type, startsAt, endsAt, convocationTime, location, meetingPoint, opponent, description }) => {
              // Resolve teams the user can manage (team coach/admin OR club admin/dirigeant)
              const managedTeamIds = await getManagedTeamIds();
              let coached: Array<{ id: string; name: string }> = [];
              if (managedTeamIds.length > 0) {
                const { data: teamRows } = await supabase
                  .from("teams")
                  .select("id, name")
                  .in("id", managedTeamIds);
                coached = (teamRows ?? []) as Array<{ id: string; name: string }>;
              }
              if (coached.length === 0) {
                return {
                  created: false,
                  note: "L'utilisateur n'encadre aucune équipe — création refusée.",
                };
              }
              const needle = teamName.toLowerCase().trim();
              const exact = coached.find((t) => t.name.toLowerCase() === needle);
              const matches =
                exact !== undefined
                  ? [exact]
                  : coached.filter((t) => t.name.toLowerCase().includes(needle));
              if (matches.length === 0) {
                return {
                  created: false,
                  note: `Aucune équipe trouvée pour "${teamName}". Équipes disponibles : ${coached.map((t) => t.name).join(", ")}.`,
                };
              }
              if (matches.length > 1) {
                return {
                  created: false,
                  note: `Plusieurs équipes correspondent à "${teamName}" : ${matches.map((t) => t.name).join(", ")}. Demande à l'utilisateur de préciser.`,
                };
              }
              const team = matches[0];

              // Validate the parsed date
              const startsAtDate = new Date(startsAt);
              if (Number.isNaN(startsAtDate.getTime())) {
                return { created: false, note: "Date/heure de début invalide." };
              }
              if (startsAtDate.getTime() < Date.now() - 60_000) {
                return { created: false, note: "La date/heure de début est dans le passé." };
              }

              const { data: created, error } = await supabase
                .from("events")
                .insert({
                  team_id: team.id,
                  title,
                  type,
                  starts_at: startsAtDate.toISOString(),
                  ends_at: endsAt ? new Date(endsAt).toISOString() : null,
                  convocation_time: convocationTime ? new Date(convocationTime).toISOString() : null,
                  location: location ?? null,
                  meeting_point: meetingPoint ?? null,
                  opponent: opponent ?? null,
                  description: description ?? null,
                  status: "draft",
                  convocations_sent: false,
                  created_by: userId,
                })
                .select("id, title, starts_at, type, status, team_id")
                .single();
              if (error || !created) {
                return {
                  created: false,
                  note: `Échec de la création : ${error?.message ?? "erreur inconnue"}.`,
                };
              }
              return {
                created: true,
                event: {
                  id: created.id,
                  title: created.title,
                  type: created.type,
                  starts_at: created.starts_at,
                  status: created.status,
                  team: team.name,
                  edit_link: `/events/${created.id}`,
                },
                note: `Événement créé en brouillon pour ${team.name}. Pour publier et envoyer les convocations, l'utilisateur doit ouvrir l'événement (lien fourni), sélectionner les joueurs convoqués et cliquer 'Publier'.`,
              };
            },
          }),
          updateEvent: tool({
            description:
              "Pour coachs/admins uniquement : met à jour les champs d'un événement existant (de préférence en brouillon, mais aussi publié). Utilise-le quand l'utilisateur veut corriger un champ (heure de RDV, lieu, point de ralliement, titre, date, etc.) après création. Ne touche que les champs fournis. **Demande confirmation explicite avant l'appel** en récapitulant l'événement ciblé et les changements.",
            inputSchema: z.object({
              eventId: z.string().uuid().describe("ID de l'événement à mettre à jour."),
              title: z.string().min(1).max(200).optional(),
              startsAt: z.string().optional().describe("ISO 8601 avec fuseau."),
              endsAt: z.string().optional().describe("ISO 8601 avec fuseau."),
              convocationTime: z.string().optional().describe("Heure de RDV, ISO 8601 avec fuseau."),
              location: z.string().max(200).optional(),
              meetingPoint: z.string().max(200).optional(),
              opponent: z.string().max(200).optional(),
              description: z.string().max(1000).optional(),
            }),
            execute: async ({ eventId, title, startsAt, endsAt, convocationTime, location, meetingPoint, opponent, description }) => {
              const { data: ev, error: evErr } = await supabase
                .from("events")
                .select("id, team_id, title, team:team_id(name)")
                .eq("id", eventId)
                .maybeSingle();
              if (evErr || !ev) {
                return { updated: false, note: "Événement introuvable ou non accessible." };
              }
              const managedTeamIds = await getManagedTeamIds();
              if (!managedTeamIds.includes(ev.team_id)) {
                return { updated: false, note: "L'utilisateur n'encadre pas l'équipe de cet événement." };
              }
              const patch: Database["public"]["Tables"]["events"]["Update"] = {};
              if (title !== undefined) patch.title = title;
              if (startsAt !== undefined) {
                const d = new Date(startsAt);
                if (Number.isNaN(d.getTime())) return { updated: false, note: "startsAt invalide." };
                patch.starts_at = d.toISOString();
              }
              if (endsAt !== undefined) {
                const d = new Date(endsAt);
                if (Number.isNaN(d.getTime())) return { updated: false, note: "endsAt invalide." };
                patch.ends_at = d.toISOString();
              }
              if (convocationTime !== undefined) {
                const d = new Date(convocationTime);
                if (Number.isNaN(d.getTime())) return { updated: false, note: "convocationTime invalide." };
                patch.convocation_time = d.toISOString();
              }
              if (location !== undefined) patch.location = location;
              if (meetingPoint !== undefined) patch.meeting_point = meetingPoint;
              if (opponent !== undefined) patch.opponent = opponent;
              if (description !== undefined) patch.description = description;
              if (Object.keys(patch).length === 0) {
                return { updated: false, note: "Aucun champ à mettre à jour." };
              }
              const { data: updated, error } = await supabase
                .from("events")
                .update(patch)
                .eq("id", eventId)
                .select("id, title, starts_at, convocation_time, location, meeting_point, status")
                .single();
              if (error || !updated) {
                return { updated: false, note: `Échec de la mise à jour : ${error?.message ?? "erreur inconnue"}.` };
              }
              return {
                updated: true,
                event: { ...updated, edit_link: `/events/${updated.id}` },
                updated_fields: Object.keys(patch),
              };
            },
          }),
        };

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        try {
          const result = streamText({
            model,
            system: (() => {
              const now = new Date();
              const dateStr = now.toLocaleDateString("fr-FR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "Europe/Paris",
              });
              const isoNow = now.toISOString();
              return `Date et heure actuelles : ${dateStr} (ISO: ${isoNow}, fuseau de référence : Europe/Paris).\nQuand l'utilisateur dit "samedi prochain", "demain", "la semaine prochaine", calcule la date à partir de cette date actuelle. Ne demande jamais à l'utilisateur de te confirmer l'année ou le mois courant — tu les connais.\n\n${SYSTEM_PROMPT}`;
            })(),
            tools,
            stopWhen: stepCountIs(50),
            messages: await convertToModelMessages(messages as UIMessage[]),
          });
          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
          });
        } catch (err: any) {
          console.error("[chat] streamText error", err);
          const status = err?.statusCode ?? err?.status ?? 500;
          if (status === 429) {
            return new Response("Trop de requêtes. Merci de réessayer dans un instant.", { status: 429 });
          }
          if (status === 402) {
            return new Response("Crédits IA épuisés. L'admin doit recharger l'espace de travail.", { status: 402 });
          }
          return new Response("Erreur de l'assistant.", { status: 500 });
        }
      },
    },
  },
});
