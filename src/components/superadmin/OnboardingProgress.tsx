import { Check, Circle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type OnboardingStep = {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
};

export function OnboardingProgress({
  title,
  steps,
  className,
}: {
  title: string;
  steps: OnboardingStep[];
  className?: string;
}) {
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total && total > 0;

  return (
    <section
      className={cn(
        "rounded-xl border p-4",
        allDone
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-primary/30 bg-gradient-to-br from-primary/5 to-accent/30",
        className,
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            allDone ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/15 text-primary",
          )}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{title}</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {completed}/{total} · {pct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-primary/10 overflow-hidden">
            <div
              className={cn("h-full transition-all", allDone ? "bg-emerald-500" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <ul className="grid sm:grid-cols-2 gap-1.5">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-2.5 rounded-lg px-2.5 py-2 border",
              step.done ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/50",
            )}
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                step.done
                  ? "bg-emerald-500 text-white"
                  : "border border-muted-foreground/40 text-muted-foreground",
              )}
            >
              {step.done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
            </span>
            <div className="min-w-0">
              <div
                className={cn(
                  "text-xs font-medium",
                  step.done && "text-muted-foreground line-through",
                )}
              >
                {step.label}
              </div>
              {step.hint && !step.done && (
                <div className="text-[10px] text-muted-foreground mt-0.5">{step.hint}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
