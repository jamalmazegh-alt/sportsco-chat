import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Star, Hand, CircleDot } from "lucide-react";
import { PitchSvg } from "@/components/lineup/pitch-svg";
import { PlayerChip, type PlayerLite } from "@/components/lineup/pitch-pieces";
import { Skeleton } from "@/components/ui/skeleton";

interface Slot {
  id: string;
  role: string;
  x: number;
  y: number;
  player_id: string | null;
}

export function PublishedLineupCard({ eventId, teamId }: { eventId: string; teamId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["published-lineup", eventId],
    queryFn: async () => {
      const { data: l } = await supabase
        .from("event_lineups")
        .select("formation, slots, bench, captain_player_id, gk_player_id, published_at")
        .eq("event_id", eventId)
        .not("published_at", "is", null)
        .maybeSingle();
      if (!l) return null;
      const ids = new Set<string>();
      (l.slots as any[])?.forEach((s) => s.player_id && ids.add(s.player_id));
      (l.bench as any[])?.forEach((id) => ids.add(id));
      if (l.captain_player_id) ids.add(l.captain_player_id);
      if (l.gk_player_id) ids.add(l.gk_player_id);
      if (ids.size === 0) return { ...l, players: new Map<string, PlayerLite>() };
      const { data: players } = await supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number, photo_url")
        .in("id", Array.from(ids));
      const m = new Map<string, PlayerLite>();
      (players ?? []).forEach((p: any) => m.set(p.id, p));
      return { ...l, players: m };
    },
  });

  if (!data) return null;
  const slots = (data.slots as unknown as Slot[]) ?? [];
  const bench = (data.bench as unknown as string[]) ?? [];

  return (
    <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
      <div className="p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-primary" />
            {t("lineup.publishedTitle", "Composition prévue")}
          </h3>
          <p className="text-xs text-muted-foreground">{data.formation}</p>
        </div>
      </div>
      <div className="relative aspect-[2/3] max-h-[60vh] bg-emerald-900">
        <PitchSvg />
        {slots.map((s) => {
          const p = s.player_id ? data.players.get(s.player_id) : null;
          return (
            <div
              key={s.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              {p ? (
                <PlayerChip
                  player={p}
                  isCaptain={data.captain_player_id === p.id}
                  isGK={data.gk_player_id === p.id}
                  size="sm"
                />
              ) : (
                <div className="h-11 w-11 rounded-full border-2 border-dashed border-white/40" />
              )}
            </div>
          );
        })}
      </div>
      {bench.length > 0 && (
        <div className="p-3 bg-muted/40 border-t">
          <p className="text-xs font-semibold mb-2">{t("lineup.bench", "Remplaçants")}</p>
          <div className="flex flex-wrap gap-2">
            {bench.map((id) => {
              const p = data.players.get(id);
              if (!p) return null;
              return <PlayerChip key={id} player={p} size="sm" />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
