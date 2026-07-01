/**
 * Sponsor session tracker (localStorage) — decoupled from Supabase auth.
 * Impressions/clicks dedup per session so daily aggregates stay realistic.
 */

const KEY = "clubero:sponsor-session:v1";
const IDLE_MS = 30 * 60 * 1000; // 30 minutes of inactivity → new session
const CLICK_CAP_PER_SPONSOR = 5;

type SessionState = {
  sessionId: string;
  lastActivity: number;
  seenSponsorIds: string[];
  clickCounts: Record<string, number>;
};

function newSessionId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 36);
}

function read(): SessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    if (!parsed.sessionId) return null;
    return {
      sessionId: String(parsed.sessionId),
      lastActivity: Number(parsed.lastActivity ?? 0),
      seenSponsorIds: Array.isArray(parsed.seenSponsorIds) ? parsed.seenSponsorIds.map(String) : [],
      clickCounts: (parsed.clickCounts as Record<string, number>) ?? {},
    };
  } catch {
    return null;
  }
}

function write(state: SessionState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // localStorage may be full or blocked — ignore.
  }
}

function ensureFreshSession(now: number): SessionState {
  const cur = read();
  if (!cur || now - cur.lastActivity > IDLE_MS) {
    const fresh: SessionState = {
      sessionId: newSessionId(),
      lastActivity: now,
      seenSponsorIds: [],
      clickCounts: {},
    };
    write(fresh);
    return fresh;
  }
  cur.lastActivity = now;
  write(cur);
  return cur;
}

/** Force-start a new session (call on SIGNED_IN). */
export function resetSponsorSession() {
  const fresh: SessionState = {
    sessionId: newSessionId(),
    lastActivity: Date.now(),
    seenSponsorIds: [],
    clickCounts: {},
  };
  write(fresh);
}

/** Returns true when this impression should be sent (not already seen in session). */
export function shouldRecordImpression(sponsorId: string): boolean {
  const s = ensureFreshSession(Date.now());
  if (s.seenSponsorIds.includes(sponsorId)) return false;
  s.seenSponsorIds.push(sponsorId);
  write(s);
  return true;
}

/** Returns true when this click should be sent (respects the per-sponsor cap). */
export function shouldRecordClick(sponsorId: string): boolean {
  const s = ensureFreshSession(Date.now());
  const cur = s.clickCounts[sponsorId] ?? 0;
  if (cur >= CLICK_CAP_PER_SPONSOR) return false;
  s.clickCounts[sponsorId] = cur + 1;
  write(s);
  return true;
}
