import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AnswersMap, ContactPayload, Question } from "./build-clubero-config";
import { parseUtm } from "./build-clubero-config";

const STORAGE_KEY = "clubero:build-clubero:v1";

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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [started, setStarted] = useState(false);

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
      const { error } = await supabase.rpc("start_build_clubero_response" as never, {
        p_session_id: sessionId,
        p_locale: locale,
        p_utm: utm,
        p_device: device,
      } as never);
      if (!cancelled) {
        setStarted(true);
        if (error) {
          // Non-fatal: user can still fill in, we'll retry on next save.
          console.warn("[build-clubero] start failed", error.message);
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

  const saveAnswer = useCallback(
    async (key: string) => {
      const q = questionByKey.get(key);
      if (!q) return;
      const value = answersRef.current[key];
      if (value === undefined || value === null || value === "") return;
      setSaveState("saving");
      const { error } = await supabase.rpc("save_build_clubero_answer" as never, {
        p_session_id: sessionId,
        p_question_key: key,
        p_question_type: q.type,
        p_value: value as never,
      } as never);
      if (error) {
        setSaveState("error");
        console.warn("[build-clubero] save failed", key, error.message);
      } else {
        setSaveState("saved");
      }
    },
    [questionByKey, sessionId],
  );

  const flush = useCallback(async () => {
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
    }
  }, [saveAnswer]);

  const setAnswer = useCallback(
    (key: string, value: unknown) => {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      dirtyKeys.current.add(key);
      setSaveState("saving");
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => {
        void flush();
      }, autosaveDelayMs);
    },
    [autosaveDelayMs, flush],
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
      const { error } = await supabase.rpc("complete_build_clubero_response" as never, {
        p_session_id: sessionId,
        p_contact: (contact ?? null) as never,
      } as never);
      if (error) throw new Error(error.message);
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
