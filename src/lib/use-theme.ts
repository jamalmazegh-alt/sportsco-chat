import { useEffect, useState, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "clubero-theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const isDark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : "system";
}

/** Hook: returns current theme mode + setter that persists & applies. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode());

  useEffect(() => {
    applyTheme(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setTheme = useCallback((next: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setMode(next);
  }, []);

  return { mode, setTheme };
}

/** Apply stored theme as early as possible (call from app bootstrap). */
export function bootstrapTheme() {
  if (typeof window === "undefined") return;
  applyTheme(readStoredMode());
}
