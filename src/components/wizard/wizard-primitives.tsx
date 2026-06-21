import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Modern segmented progress bar.
 * - Active step glows with primary gradient
 * - Completed steps filled flat
 * - Upcoming steps muted
 * Use variant="onPrimary" inside a colored header (e.g. EventWizard's gradient bar).
 */
export function WizardProgress({
  step,
  total,
  variant = "default",
  className,
}: {
  step: number;
  total: number;
  variant?: "default" | "onPrimary";
  className?: string;
}) {
  const onPrimary = variant === "onPrimary";
  return (
    <div className={cn("flex gap-1.5", className)}>
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === step;
        const isDone = i < step;
        return (
          <div
            key={i}
            className={cn(
              "relative h-1.5 flex-1 rounded-full overflow-hidden transition-colors duration-300",
              onPrimary
                ? isDone
                  ? "bg-white"
                  : isActive
                    ? "bg-white/80"
                    : "bg-white/25"
                : isDone
                  ? "bg-primary"
                  : isActive
                    ? "bg-primary/40"
                    : "bg-muted",
            )}
          >
            {isActive && !onPrimary && (
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-primary animate-[fade-in_0.3s_ease-out]"
              />
            )}
            {isActive && onPrimary && (
              <span
                aria-hidden
                className="absolute inset-0 bg-white animate-[fade-in_0.3s_ease-out]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Step heading with halo icon + uppercase eyebrow.
 * Matches the home-quick-cards aesthetic.
 */
export function WizardStepHeading({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="icon-halo h-9 w-9 rounded-lg bg-accent flex items-center justify-center text-accent-foreground shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold leading-none mb-1">
              {eyebrow}
            </div>
          )}
          <h3 className="text-base font-semibold leading-tight truncate">{title}</h3>
        </div>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      )}
    </div>
  );
}

/**
 * Selectable option card with halo glow + speed-lines on active.
 */
export function WizardOptionCard({
  active,
  onClick,
  title,
  description,
  icon,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
        className,
      )}
    >
      {active && (
        <div
          aria-hidden
          className="absolute inset-0 bg-speed-lines opacity-50 pointer-events-none"
        />
      )}
      <div className="relative flex items-start gap-3">
        {icon && (
          <div
            className={cn(
              "icon-halo h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
              active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm leading-tight">{title}</div>
          {description && (
            <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {description}
            </div>
          )}
        </div>
        <div
          className={cn(
            "shrink-0 h-5 w-5 rounded-full flex items-center justify-center border transition-all",
            active
              ? "bg-primary border-primary text-primary-foreground scale-100"
              : "border-border bg-background scale-90 opacity-60 group-hover:opacity-100",
          )}
        >
          {active && <Check className="h-3 w-3" strokeWidth={3} />}
        </div>
      </div>
    </button>
  );
}

/**
 * Animated step container — fades content on step change.
 * Wrap each step body and key by step id/index.
 */
export function WizardStepBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("animate-[fade-in_0.25s_ease-out] space-y-4", className)}>{children}</div>
  );
}
