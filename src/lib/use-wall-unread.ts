import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY_PREFIX = "clubero:wall:lastSeenAt:";

function readLastSeen(clubId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(KEY_PREFIX + clubId);
  return raw ? Number(raw) || 0 : 0;
}

function writeLastSeen(clubId: string, ts: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_PREFIX + clubId, String(ts));
}

/**
 * Tracks how many wall_posts have been created since the user last opened the wall
 * for the active club. Persisted in localStorage so the badge survives reloads.
 */
export function useWallUnread(clubId: string | null) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!clubId) {
      setCount(0);
      return;
    }
    const lastSeen = readLastSeen(clubId);
    const sinceIso = new Date(lastSeen || 0).toISOString();
    const { count: c } = await supabase
      .from("wall_posts")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .gt("created_at", sinceIso);
    setCount(c ?? 0);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh on any new post for the active club
  useEffect(() => {
    if (!clubId) return;
    const ch = supabase
      .channel(`wall-unread:${clubId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wall_posts", filter: `club_id=eq.${clubId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [clubId, refresh]);

  const markSeen = useCallback(() => {
    if (!clubId) return;
    writeLastSeen(clubId, Date.now());
    setCount(0);
  }, [clubId]);

  return { count, markSeen, refresh };
}
