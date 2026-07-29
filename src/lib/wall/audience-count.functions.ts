import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Taille d'audience réelle de chaque post du mur (dénominateur du "Lu par X/Y").
 *
 * La logique de résolution est alignée sur celle du push (`push-dispatch-wall.server.ts`)
 * et de la RLS `user_in_wall_post_audience` :
 *  - club            → tous les membres du club
 *  - team/multi_team → staff + joueurs + parents des équipes ciblées (+ admins/dirigeants)
 *  - team_staff      → coachs/dirigeants des équipes ciblées + admins/dirigeants du club
 *  - group           → membres du/des groupe(s) ciblé(s) (+ admins/dirigeants)
 *
 * Réservé au staff du club (admin / coach / dirigeant) : c'est la même population
 * que celle qui voit le compteur de lecture dans l'UI.
 */

const InputSchema = z.object({
  clubId: z.string().uuid(),
  postIds: z.array(z.string().uuid()).max(100),
});

export const getWallPostAudienceCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<Record<string, number>> => {
    const { clubId, postIds } = data;
    if (postIds.length === 0) return {};

    // Contrôle d'accès : le caller doit être staff du club (RLS-scoped read).
    const { data: me } = await context.supabase
      .from("club_members")
      .select("role")
      .eq("club_id", clubId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = (me as { role?: string } | null)?.role ?? null;
    if (!role || !["admin", "coach", "dirigeant"].includes(role)) return {};

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: posts } = await supabaseAdmin
      .from("wall_posts")
      .select("id, club_id, audience_type, audience_team_ids, audience_group_ids")
      .eq("club_id", clubId)
      .in("id", postIds);
    if (!posts || posts.length === 0) return {};

    // Membres du club (une seule requête réutilisée pour tous les posts).
    const { data: members } = await supabaseAdmin
      .from("club_members")
      .select("user_id, role")
      .eq("club_id", clubId);
    const clubUserIds = new Set<string>();
    const privilegedUserIds = new Set<string>();
    for (const m of members ?? []) {
      const uid = (m as { user_id: string | null }).user_id;
      if (!uid) continue;
      clubUserIds.add(uid);
      const r = (m as { role: string | null }).role;
      if (r === "admin" || r === "dirigeant") privilegedUserIds.add(uid);
    }

    const result: Record<string, number> = {};

    for (const post of posts) {
      const p = post as {
        id: string;
        audience_type: string | null;
        audience_team_ids: string[] | null;
        audience_group_ids: string[] | null;
      };
      const audienceType = p.audience_type || "club";
      const teamIds = p.audience_team_ids ?? null;
      const groupIds = p.audience_group_ids ?? null;

      // Post club-wide : tous les membres.
      if (audienceType === "club" || (!teamIds?.length && !groupIds?.length)) {
        result[p.id] = clubUserIds.size;
        continue;
      }

      const audience = new Set<string>(privilegedUserIds);

      if (audienceType === "group" && groupIds?.length) {
        const { data: gm } = await supabaseAdmin
          .from("club_group_members")
          .select("club_members:member_id(user_id)")
          .in("group_id", groupIds);
        for (const row of gm ?? []) {
          const uid =
            ((row as { club_members?: { user_id: string | null } }).club_members?.user_id ??
              null) ||
            null;
          if (uid) audience.add(uid);
        }
      } else if (teamIds?.length) {
        const { data: liveTeams } = await supabaseAdmin
          .from("teams")
          .select("id")
          .in("id", teamIds)
          .eq("club_id", clubId)
          .is("deleted_at", null);
        const liveIds = (liveTeams ?? []).map((t) => (t as { id: string }).id);
        if (liveIds.length > 0) {
          if (audienceType === "team_staff") {
            const { data: staffRows } = await supabaseAdmin
              .from("team_members")
              .select("user_id")
              .in("team_id", liveIds)
              .in("role", ["coach", "dirigeant"]);
            for (const r of staffRows ?? []) {
              const uid = (r as { user_id: string | null }).user_id;
              if (uid) audience.add(uid);
            }
          } else {
            const { data: tmRows } = await supabaseAdmin
              .from("team_members")
              .select("user_id, player_id")
              .in("team_id", liveIds);
            const playerIds: string[] = [];
            for (const r of tmRows ?? []) {
              const row = r as { user_id: string | null; player_id: string | null };
              if (row.user_id) audience.add(row.user_id);
              if (row.player_id) playerIds.push(row.player_id);
            }
            if (playerIds.length > 0) {
              const { data: playerRows } = await supabaseAdmin
                .from("players")
                .select("id, user_id")
                .in("id", playerIds)
                .is("deleted_at", null);
              const liveePlayerIds: string[] = [];
              for (const pl of playerRows ?? []) {
                const row = pl as { id: string; user_id: string | null };
                liveePlayerIds.push(row.id);
                if (row.user_id) audience.add(row.user_id);
              }
              if (liveePlayerIds.length > 0) {
                const { data: parentRows } = await supabaseAdmin
                  .from("player_parents")
                  .select("parent_user_id")
                  .in("player_id", liveePlayerIds);
                for (const pr of parentRows ?? []) {
                  const uid = (pr as { parent_user_id: string | null }).parent_user_id;
                  if (uid) audience.add(uid);
                }
              }
            }
          }
        }
      }

      result[p.id] = audience.size;
    }

    return result;
  });
