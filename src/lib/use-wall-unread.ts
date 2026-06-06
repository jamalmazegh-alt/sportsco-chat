import { useEffect, useState, useCallback, useRef } from "react";
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
 * Singleton subscription manager — one Realtime channel per clubId, shared
 * across every hook caller. Avoids duplicate subscriptions when both the
 * bottom nav and the inbox mount the hook simultaneously.
 */
type Entry = {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<() => void>;
  count: number;
  inflight: Promise<void> | null;
};
const registry = new Map<string, Entry>();

async function fetchCount(clubId: string): Promise<number> {
  const lastSeen = readLastSeen(clubId);
  const sinceIso = new Date(lastSeen || 0).toISOString();
  const { count } = await supabase
    .from("wall_posts")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .gt("created_at", sinceIso);
  return count ?? 0;
}

function subscribe(clubId: string, cb: () => void): () => void {
  let entry = registry.get(clubId);
  if (!entry) {
    const channel = supabase.channel(`wall-unread:${clubId}`);
    entry = { channel, listeners: new Set(), count: 0, inflight: null };
    registry.set(clubId, entry);
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wall_posts", filter: `club_id=eq.${clubId}` },
        () => {
          const e = registry.get(clubId);
          if (!e) return;
          fetchCount(clubId).then((c) => {
            e.count = c;
            e.listeners.forEach((l) => l());
          });
        },
      )
      .subscribe();
  }
  entry.listeners.add(cb);
  return () => {
    const e = registry.get(clubId);
    if (!e) return;
    e.listeners.delete(cb);
    if (e.listeners.size === 0) {
      supabase.removeChannel(e.channel);
      registry.delete(clubId);
    }
  };
}

export function useWallUnread(clubId: string | null) {
  const [count, setCount] = useState(0);
  const clubIdRef = useRef(clubId);
  clubIdRef.current = clubId;

  const refresh = useCallback(async () => {
    const id = clubIdRef.current;
    if (!id) {
      setCount(0);
      return;
    }
    const c = await fetchCount(id);
    const e = registry.get(id);
    if (e) e.count = c;
    setCount(c);
  }, []);

  useEffect(() => {
    if (!clubId) {
      setCount(0);
      return;
    }
    refresh();
    const unsub = subscribe(clubId, () => {
      const e = registry.get(clubId);
      if (e) setCount(e.count);
    });
    return unsub;
  }, [clubId, refresh]);

  const markSeen = useCallback(() => {
    if (!clubId) return;
    writeLastSeen(clubId, Date.now());
    const e = registry.get(clubId);
    if (e) {
      e.count = 0;
      e.listeners.forEach((l) => l());
    }
    setCount(0);
  }, [clubId]);

  return { count, markSeen, refresh };
}
