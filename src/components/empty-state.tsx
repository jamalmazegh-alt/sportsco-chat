import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}

/**
 * Standardized empty state with optional CTA. Use everywhere a list/section
 * has no items so the user always knows what to do next.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border bg-card p-8 text-center flex flex-col items-center gap-3",
        className
      )}
    >
      {icon && (
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="space-y-1 max-w-xs">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
