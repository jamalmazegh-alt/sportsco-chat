import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LineupEmailData, LineupEmailPlayer } from "./lineup-email";

const InputSchema = z.object({ eventId: z.string().uuid() });

interface Slot {
  id: string;
  role: string;
  x: number;
  y: number;
  player_id: string | null;
}

export const loadLineupForConvocationEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<LineupEmailData | undefined> => {
    const { data: lineup } = await supabaseAdmin
      .from("event_lineups")
      .select("team_id, formation, slots, bench, captain_player_id, gk_player_id, published_at, include_in_convocation")
      .eq("event_id", data.eventId)
      .not("published_at", "is", null)
      .maybeSingle();

    if (!lineup || !lineup.include_in_convocation) return undefined;

    const { data: canSend } = await supabaseAdmin.rpc("is_team_coach", {
      _user_id: context.userId,
      _team_id: lineup.team_id,
    });
    if (!canSend) return undefined;

    const slots = (lineup.slots as unknown as Slot[]) ?? [];
    const benchIds = (lineup.bench as unknown as string[]) ?? [];
    const ids = new Set<string>();
    slots.forEach((s) => s.player_id && ids.add(s.player_id));
    benchIds.forEach((id) => ids.add(id));
    if (ids.size === 0) return undefined;

    const { data: players } = await supabaseAdmin
      .from("players")
      .select("id, first_name, last_name, jersey_number")
      .in("id", Array.from(ids));

    const byId = new Map<string, any>((players ?? []).map((p: any) => [p.id, p]));
    const fullName = (p: any) => `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "—";
    const starting: LineupEmailPlayer[] = slots
      .filter((s) => s.player_id)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((s) => {
        const p = byId.get(s.player_id!);
        return {
          name: fullName(p),
          jersey: p?.jersey_number ?? null,
          role: s.role,
          isCaptain: lineup.captain_player_id === s.player_id,
          isGK: lineup.gk_player_id === s.player_id,
        };
      });
    const bench: LineupEmailPlayer[] = benchIds.map((id) => {
      const p = byId.get(id);
      return { name: fullName(p), jersey: p?.jersey_number ?? null };
    });

    return { formation: lineup.formation ?? undefined, starting, bench };
  });