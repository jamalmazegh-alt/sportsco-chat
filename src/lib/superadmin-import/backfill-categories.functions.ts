/**
 * Backfill / recomputation des catégories FFF pour un club et une saison.
 *
 * Cas d'usage :
 *  - Après import massif quand la saison courante n'était pas encore créée.
 *  - Passage d'une saison à l'autre (recalcul global au 1er juillet).
 *  - Correction après changement de règle.
 *
 * Contrat non-destructif : par défaut on ne touche jamais à une catégorie déjà
 * saisie ; passer `overwrite: true` recalcule TOUT (à réserver aux admins qui
 * savent ce qu'ils font — les surclassements manuels sont écrasés).
 *
 * Autorisation : super-admin OU admin/financial_admin du club cible.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeFffCategory,
  parseSeasonEndYear,
  seasonLabelFromEndYear,
} from "@/lib/fff-category";

async function assertClubAdminOrSuper(
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
  const { data } = await supabase
    .from("club_members")
    .select("roles, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  const rolesArr = ((data as { roles?: string[] | null } | null)?.roles ?? []) as string[];
  const single = (data as { role?: string | null } | null)?.role;
  const roles = new Set<string>([...rolesArr, ...(single ? [single] : [])]);
  if (!roles.has("admin")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export const recomputePlayerCategoriesForSeason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clubId: z.string().uuid(),
        /** Ex: "2024-2025", "24-25", "2025". Si absent, saison courante du club. */
        seasonLabel: z.string().min(2).max(20).optional(),
        /** `true` = écrase les catégories existantes (attention surclassements). */
        overwrite: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertClubAdminOrSuper(context.supabase, context.userId, data.clubId);

    // Résoudre la saison cible.
    let seasonLabel: string;
    let endYear: number;
    if (data.seasonLabel) {
      const parsed = parseSeasonEndYear(data.seasonLabel);
      if (parsed == null) throw new Error(`Saison invalide: ${data.seasonLabel}`);
      endYear = parsed;
      seasonLabel = seasonLabelFromEndYear(endYear);
    } else {
      const { data: cur } = await supabaseAdmin
        .from("seasons")
        .select("label")
        .eq("club_id", data.clubId)
        .eq("is_current", true)
        .maybeSingle();
      if (!cur?.label) throw new Error("Aucune saison courante définie pour ce club.");
      const parsed = parseSeasonEndYear(cur.label);
      if (parsed == null) throw new Error(`Label saison courante invalide: ${cur.label}`);
      endYear = parsed;
      seasonLabel = cur.label;
    }

    // Lignes existantes pour cette saison / club.
    const { data: existing } = await supabaseAdmin
      .from("player_seasons")
      .select("id, player_id, category")
      .eq("club_id", data.clubId)
      .eq("season_label", seasonLabel);

    const rows = (existing ?? []) as Array<{
      id: string;
      player_id: string;
      category: string | null;
    }>;

    // Charger les birth_date des joueurs concernés.
    const playerIds = Array.from(new Set(rows.map((r) => r.player_id)));
    const { data: players } = playerIds.length
      ? await supabaseAdmin
          .from("players")
          .select("id, birth_date")
          .in("id", playerIds)
      : { data: [] as Array<{ id: string; birth_date: string | null }> };
    const dobByPlayer = new Map<string, string | null>();
    for (const p of (players ?? []) as Array<{ id: string; birth_date: string | null }>) {
      dobByPlayer.set(p.id, p.birth_date);
    }

    let updated = 0;
    let skipped = 0;
    let missingDob = 0;

    for (const row of rows) {
      const dob = dobByPlayer.get(row.player_id);
      if (!dob) {
        missingDob++;
        continue;
      }
      const computed = computeFffCategory(dob, endYear);
      if (!computed) {
        skipped++;
        continue;
      }
      if (row.category && !data.overwrite) {
        skipped++;
        continue;
      }
      if (row.category === computed) {
        skipped++;
        continue;
      }
      const { error } = await supabaseAdmin
        .from("player_seasons")
        .update({ category: computed } as never)
        .eq("id", row.id);
      if (!error) updated++;
    }

    return {
      seasonLabel,
      total: rows.length,
      updated,
      skipped,
      missingDob,
    };
  });
