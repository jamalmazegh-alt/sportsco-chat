// Shared constants for the Support feature.
// Keep enum values in sync with the DB enums.

export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
] as const;

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const SUPPORT_CATEGORIES = [
  "bug",
  "payment",
  "account",
  "team",
  "event",
  "feature_request",
  "other",
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

// Tailwind classes for status badges (shared between user + admin views).
export const STATUS_BADGE_CLASS: Record<SupportStatus, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  in_progress:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  waiting_user:
    "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  resolved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  closed: "bg-muted text-muted-foreground",
};

export const PRIORITY_BADGE_CLASS: Record<SupportPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

// i18n key helpers — namespace `support`
export const statusKey = (s: string) => `support:status.${s}`;
export const priorityKey = (p: string) => `support:priority.${p}`;
export const categoryKey = (c: string) => `support:category.${c}`;
