import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswersMap, ContactPayload, Question } from "./build-clubero-config";
import { parseUtm } from "./build-clubero-config";

const STORAGE_KEY = "clubero:build-clubero:v1";
const API_BASE = "/api/public/build-clubero";

async function postJson(path: string, payload: unknown): Promise<{ ok: boolean; status: number; body: unknown }>
{
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* no body */ }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: err instanceof Error ? err.message : "network_error" } };
  }
}

interface Persisted {
  session_id: string;
  answers: AnswersMap;
  index: number;
}

function randomSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!parsed?.session_id || typeof parsed.session_id !== "string") return null;
    return {
      session_id: parsed.session_id,
      answers: (parsed.answers as AnswersMap) ?? {},
      index: typeof parsed.index === "number" ? parsed.index : 0,
    };
  } catch {
    return null;
  }
}

function writePersisted(p: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* quota exceeded — non-blocking */
  }
}

function clearPersisted() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-blocking */
  }
}

export interface UseSessionOptions {
  questions: Question[];
  locale: string;
  autosaveDelayMs?: number;
}

export function useBuildCluberoSession({
  questions,
  locale,
  autosaveDelayMs = 600,
}: UseSessionOptions) {
  const [sessionId, setSessionId] = useState<string>(() => {
    const p = readPersisted();
    return p?.session_id ?? randomSessionId();
  });
  const [answers, setAnswers] = useState<AnswersMap>(() => readPersisted()?.answers ?? {});
  const [index, setIndex] = useState<number>(() => readPersisted()?.index ?? 0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "retrying" | "closed">("idle");
  const [started, setStarted] = useState(false);
  // Terminal flag: once the session is server-side completed we must stop
  // autosaving to avoid an infinite 409 retry loop against a closed session.
  const closedRef = useRef(false);
  // Simple exponential backoff (with jitter) shared by all pending saves so
  // that repeated 429s do not turn every keystroke into a new burst.
  const backoffUntilRef = useRef<number>(0);
  const backoffAttemptRef = useRef<number>(0);

  const questionByKey = useMemo(() => {
    const m = new Map<string, Question>();
    for (const q of questions) m.set(q.key, q);
    return m;
  }, [questions]);

  // Pending dirty keys awaiting flush
  const dirtyKeys = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef<AnswersMap>(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Start the session on mount
  useEffect(() => {
    if (started) return;
    let cancelled = false;
    (async () => {
      const utm = typeof window !== "undefined" ? parseUtm(window.location.search) : null;
      const device =
        typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop";
      const res = await postJson("/start", {
        session_id: sessionId,
        locale,
        utm,
        device,
      });
      if (!cancelled) {
        setStarted(true);
        if (!res.ok) {
          console.warn("[build-clubero] start failed", res.status);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    writePersisted({ session_id: sessionId, answers, index });
  }, [sessionId, answers, index]);

  const scheduleFlush = useCallback(
    (delay: number) => {
      if (closedRef.current) return;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        void flush();
      }, delay);
    },
    // flush is defined below; safe circular via ref pattern
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const saveAnswer = useCallback(
    async (key: string) => {
      if (closedRef.current) return;
      const q = questionByKey.get(key);
      if (!q) return;
      const value = answersRef.current[key];
      if (value === undefined || value === null || value === "") return;
      setSaveState("saving");
      const res = await postJson("/save", {
        session_id: sessionId,
        question_key: key,
        question_type: q.type,
        value,
      });
      if (res.ok) {
        backoffAttemptRef.current = 0;
        backoffUntilRef.current = 0;
        setSaveState("saved");
        return;
      }
      const bodyErr = (res.body as { error?: string } | null)?.error;
      // Terminal: session already completed server-side. Stop autosave for good.
      if (res.status === 409 && bodyErr === "response_completed") {
        closedRef.current = true;
        dirtyKeys.current.clear();
        if (flushTimer.current) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        setSaveState("closed");
        console.info("[build-clubero] session already completed, autosave stopped");
        return;
      }
      // Retryable: rate-limited or transient. Apply exponential backoff w/ jitter
      // and re-queue this key so no data is lost.
      if (res.status === 429 || res.status === 0 || res.status >= 500) {
        dirtyKeys.current.add(key);
        const attempt = Math.min(backoffAttemptRef.current + 1, 5);
        backoffAttemptRef.current = attempt;
        const base = Math.min(1000 * 2 ** (attempt - 1), 15000);
        const jitter = Math.floor(Math.random() * 400);
        const delay = base + jitter;
        backoffUntilRef.current = Date.now() + delay;
        setSaveState("retrying");
        scheduleFlush(delay);
        return;
      }
      setSaveState("error");
      console.warn("[build-clubero] save failed", key, res.status, bodyErr);
    },
    [questionByKey, scheduleFlush, sessionId],
  );

  const flush = useCallback(async () => {
    if (closedRef.current) {
      dirtyKeys.current.clear();
      return;
    }
    // Honour outstanding backoff window: reschedule instead of hammering.
    const wait = backoffUntilRef.current - Date.now();
    if (wait > 0) {
      scheduleFlush(wait);
      return;
    }
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const keys = Array.from(dirtyKeys.current);
    dirtyKeys.current.clear();
    for (const k of keys) {
      // Sequential to avoid overwhelming; questions are small.
      // eslint-disable-next-line no-await-in-loop
      await saveAnswer(k);
      if (closedRef.current) return;
    }
  }, [saveAnswer, scheduleFlush]);

  const setAnswer = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      if (closedRef.current) return;
      dirtyKeys.current.add(key);
      // If we are inside a backoff window, keep the retrying state and let the
      // pending timer fire — do NOT reset it to a shorter debounce.
      const wait = Math.max(backoffUntilRef.current - Date.now(), autosaveDelayMs);
      setSaveState((s) => (s === "retrying" ? s : "saving"));
      scheduleFlush(wait);
    },
    [autosaveDelayMs, scheduleFlush],
  );

  // Flush on visibility hidden / pagehide
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  const complete = useCallback(
    async (contact: ContactPayload) => {
      await flush();
      const res = await postJson("/complete", {
        session_id: sessionId,
        contact,
      });
      if (!res.ok) {
        const err = (res.body as { error?: string } | null)?.error ?? `http_${res.status}`;
        throw new Error(err);
      }
    },
    [flush, sessionId],
  );

  const resetLocal = useCallback(() => {
    clearPersisted();
  }, []);

  return {
    sessionId,
    answers,
    setAnswer,
    index,
    setIndex,
    saveState,
    flush,
    complete,
    resetLocal,
  };
}

export const __test = { readPersisted, writePersisted, clearPersisted, STORAGE_KEY };
