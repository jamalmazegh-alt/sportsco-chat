// Club theme palette. Each entry overrides a small set of CSS variables
// at :root level so the whole app (including login page) re-skins.
// Keep keys in sync with the `clubs_theme_color_check` DB constraint.

export type ClubThemeKey =
  | "emerald"
  | "ocean"
  | "indigo"
  | "violet"
  | "rose"
  | "amber"
  | "crimson"
  | "slate"
  | "sky"
  | "teal"
  | "noir";

export interface ClubTheme {
  key: ClubThemeKey;
  label: string;
  /** hex for the preview swatch */
  swatch: string;
  /** oklch values for CSS vars */
  primary: string;
  primaryDark: string;
  primaryForeground: string;
  ring: string;
}

export const CLUB_THEMES: Record<ClubThemeKey, ClubTheme> = {
  emerald: {
    key: "emerald",
    label: "Émeraude",
    swatch: "#0D7A5F",
    primary: "oklch(0.60 0.13 165)",
    primaryDark: "oklch(0.70 0.14 165)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.60 0.13 165)",
  },
  ocean: {
    key: "ocean",
    label: "Océan",
    swatch: "#0E7490",
    primary: "oklch(0.58 0.13 220)",
    primaryDark: "oklch(0.70 0.14 220)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.58 0.13 220)",
  },
  indigo: {
    key: "indigo",
    label: "Indigo",
    swatch: "#4F46E5",
    primary: "oklch(0.52 0.20 270)",
    primaryDark: "oklch(0.66 0.18 270)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.52 0.20 270)",
  },
  violet: {
    key: "violet",
    label: "Violet",
    swatch: "#9333EA",
    primary: "oklch(0.55 0.22 300)",
    primaryDark: "oklch(0.68 0.20 300)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.55 0.22 300)",
  },
  rose: {
    key: "rose",
    label: "Rose",
    swatch: "#E11D48",
    primary: "oklch(0.60 0.22 10)",
    primaryDark: "oklch(0.70 0.20 10)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.60 0.22 10)",
  },
  amber: {
    key: "amber",
    label: "Ambre",
    swatch: "#D97706",
    primary: "oklch(0.68 0.16 60)",
    primaryDark: "oklch(0.76 0.16 60)",
    primaryForeground: "oklch(0.22 0.05 60)",
    ring: "oklch(0.68 0.16 60)",
  },
  crimson: {
    key: "crimson",
    label: "Cramoisi",
    swatch: "#B91C1C",
    primary: "oklch(0.55 0.22 25)",
    primaryDark: "oklch(0.66 0.20 25)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.55 0.22 25)",
  },
  slate: {
    key: "slate",
    label: "Ardoise",
    swatch: "#334155",
    primary: "oklch(0.42 0.04 255)",
    primaryDark: "oklch(0.62 0.04 255)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.42 0.04 255)",
  },
  sky: {
    key: "sky",
    label: "Ciel",
    swatch: "#0284C7",
    primary: "oklch(0.62 0.15 240)",
    primaryDark: "oklch(0.72 0.14 240)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.62 0.15 240)",
  },
  teal: {
    key: "teal",
    label: "Sarcelle",
    swatch: "#0F766E",
    primary: "oklch(0.55 0.11 190)",
    primaryDark: "oklch(0.68 0.12 190)",
    primaryForeground: "oklch(0.99 0.005 60)",
    ring: "oklch(0.55 0.11 190)",
  },
};

export const CLUB_THEME_KEYS = Object.keys(CLUB_THEMES) as ClubThemeKey[];
export const DEFAULT_CLUB_THEME: ClubThemeKey = "emerald";
export const CLUB_THEME_LS_KEY = "clubero:active_theme";

export function isClubThemeKey(v: unknown): v is ClubThemeKey {
  return typeof v === "string" && v in CLUB_THEMES;
}

export function applyClubTheme(key: ClubThemeKey | null | undefined) {
  if (typeof document === "undefined") return;
  const theme = CLUB_THEMES[isClubThemeKey(key) ? key : DEFAULT_CLUB_THEME];
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const primary = isDark ? theme.primaryDark : theme.primary;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", theme.primaryForeground);
  root.style.setProperty("--ring", theme.ring);
  root.style.setProperty("--sidebar-primary", primary);
  root.style.setProperty("--sidebar-primary-foreground", theme.primaryForeground);
  root.style.setProperty("--sidebar-ring", theme.ring);
  root.style.setProperty("--energy", primary);
  root.style.setProperty("--energy-foreground", theme.primaryForeground);
  root.style.setProperty("--present", primary);
  root.style.setProperty("--present-foreground", theme.primaryForeground);
  // chart-1 follows primary for consistency
  root.style.setProperty("--chart-1", primary);
}

export function readStoredTheme(): ClubThemeKey {
  if (typeof window === "undefined") return DEFAULT_CLUB_THEME;
  const v = window.localStorage.getItem(CLUB_THEME_LS_KEY);
  return isClubThemeKey(v) ? v : DEFAULT_CLUB_THEME;
}

export function storeTheme(key: ClubThemeKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLUB_THEME_LS_KEY, key);
}
