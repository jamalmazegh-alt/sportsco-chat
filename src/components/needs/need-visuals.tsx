/**
 * Visuals per need template (role_key) — icon + color accent.
 * Keeps the "Coups de main" block joyful and readable at a glance.
 */
import type { LucideIcon } from "lucide-react";
import {
  Megaphone,
  Flag,
  ClipboardList,
  Table,
  Timer,
  PencilLine,
  Hourglass,
  ClipboardEdit,
  Wrench,
  CupSoda,
  Handshake,
  PackageOpen,
  Camera,
  Music,
  Sparkles,
  HandHelping,
} from "lucide-react";
import type { TFunction } from "i18next";

type Visual = {
  Icon: LucideIcon;
  /** tailwind classes for the icon chip bg + fg */
  chip: string;
};

const VISUALS: Record<string, Visual> = {
  // Football
  ref_center: { Icon: Whistle, chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  ref_line: { Icon: Flag, chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  delegate: { Icon: ClipboardList, chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
  // Basket
  scoretable: { Icon: Table, chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  timekeeper: { Icon: Timer, chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" },
  scorer: { Icon: PencilLine, chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  shotclock_24: { Icon: Hourglass, chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  // Handball
  table_secretary: { Icon: ClipboardEdit, chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
  timekeeper_handball: { Icon: Timer, chip: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" },
  // Volley
  line_judge: { Icon: Flag, chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  setup_volley: { Icon: Wrench, chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  // Universels
  concession: { Icon: CupSoda, chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  welcome: { Icon: Handshake, chip: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300" },
  setup: { Icon: Wrench, chip: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
  teardown: { Icon: PackageOpen, chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  photographer: { Icon: Camera, chip: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300" },
  animation: { Icon: Music, chip: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
  other: { Icon: Sparkles, chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
};

const FALLBACK: Visual = { Icon: HandHelping, chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };

export function getNeedVisual(roleKey: string | null | undefined): Visual {
  if (!roleKey) return FALLBACK;
  return VISUALS[roleKey] ?? FALLBACK;
}

/**
 * Résout le libellé d'un besoin :
 * - si `label` est vide OU ressemble à une clé i18n brute
 *   (`needs.templates.xxx` / `needs:templates.xxx`), on retombe sur la
 *   traduction du template. Corrige les anciens brouillons enregistrés
 *   pendant le bug de namespace.
 */
export function resolveNeedLabel(
  need: { label?: string | null; role_key?: string | null },
  t: TFunction,
): string {
  const raw = (need.label ?? "").trim();
  const isRawKey = /^needs[.:]templates\./.test(raw);
  if (raw && !isRawKey) return raw;
  const key = need.role_key ?? "other";
  return t(`needs:templates.${key}`, { defaultValue: raw || key });
}
