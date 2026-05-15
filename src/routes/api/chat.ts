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
- Pour répondre à des questions sur les données personnelles de l'utilisateur (mes prochains événements, mes statistiques, mes enfants, mon équipe), utilise les tools fournis. Ne devine jamais — si tu n'as pas la donnée, dis-le.
- Si un tool renvoie une liste vide ou un champ "note", explique simplement la situation à l'utilisateur (ex : "tu n'as pas de joueur lié à ton compte, donc il n'y a pas de stats de présence à afficher pour toi"). Ne dis JAMAIS "non autorisé", "unauthorized", "accès refusé" ou "erreur" dans ce cas — il s'agit simplement d'une absence de données pertinentes pour ce profil (ex : un dirigeant qui n'est pas joueur n'a pas de stats personnelles).
- Tu peux expliquer les fonctionnalités : convocations (présent/absent/incertain), mur du club, chat d'événement, statistiques de présence, gestion des équipes, rôles (joueur, parent, coach, dirigeant, admin), confidentialité (export et suppression de données), consentements (RGPD, droit à l'image pour les mineurs).
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
              if (playerIds.length === 0) return { players: [] };
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
        };

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        try {
          const result = streamText({
            model,
            system: SYSTEM_PROMPT,
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
