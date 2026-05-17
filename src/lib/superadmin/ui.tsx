import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  success:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  danger:
    "bg-destructive/10 text-destructive border-destructive/20",
  muted: "bg-muted text-muted-foreground border-border",
  primary:
    "bg-primary/10 text-primary border-primary/20",
};

export function StatusBadge({
  tone = "muted",
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function subTone(status?: string | null): {
  tone: keyof typeof TONES;
  label: string;
} {
  if (!status) return { tone: "muted", label: "no sub" };
  switch (status) {
    case "active":
      return { tone: "success", label: "active" };
    case "trialing":
      return { tone: "info", label: "trial" };
    case "past_due":
      return { tone: "warn", label: "past due" };
    case "incomplete":
      return { tone: "warn", label: "incomplete" };
    case "canceled":
      return { tone: "muted", label: "canceled" };
    default:
      return { tone: "muted", label: status };
  }
}

export function roleTone(role?: string | null): keyof typeof TONES {
  switch (role) {
    case "admin":
      return "primary";
    case "coach":
      return "info";
    case "dirigeant":
      return "info";
    case "parent":
      return "warn";
    case "player":
      return "muted";
    default:
      return "muted";
  }
}

export function Avatar({
  url,
  name,
  size = 36,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-muted text-muted-foreground flex items-center justify-center font-semibold overflow-hidden shrink-0 border border-border"
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

export function categorize(action: string): {
  category: string;
  severity: "low" | "medium" | "high";
  tone: keyof typeof TONES;
} {
  if (action.startsWith("view_"))
    return { category: "View", severity: "low", tone: "muted" };
  if (action.includes("impersonate"))
    return { category: "Impersonation", severity: "high", tone: "danger" };
  if (action.includes("password"))
    return { category: "Auth", severity: "high", tone: "warn" };
  if (action.includes("disable") || action.includes("ban"))
    return { category: "Account", severity: "high", tone: "danger" };
  if (action.includes("reactivate"))
    return { category: "Account", severity: "medium", tone: "warn" };
  if (action.includes("archive") || action.includes("suspend"))
    return { category: "Club", severity: "high", tone: "danger" };
  if (action.includes("unarchive"))
    return { category: "Club", severity: "medium", tone: "warn" };
  if (action.includes("onboarding") || action.includes("invite"))
    return { category: "Onboarding", severity: "low", tone: "info" };
  if (action.includes("billing") || action.includes("subscription"))
    return { category: "Billing", severity: "medium", tone: "info" };
  return { category: "Other", severity: "low", tone: "muted" };
}

export function trialCountdown(trial_end?: string | null): string | null {
  if (!trial_end) return null;
  const ms = new Date(trial_end).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.ceil(ms / (24 * 3600 * 1000));
  return `${days} day${days === 1 ? "" : "s"} left`;
}
