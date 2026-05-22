import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoreStepperProps {
  value: number;
  onChange: (next: number) => void;
  label?: string;
  min?: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

/**
 * Big tap-friendly score input with +/- buttons surrounding a large numeric display.
 * Designed for referees entering scores on mobile during matches.
 */
export function ScoreStepper({
  value,
  onChange,
  label,
  min = 0,
  max = 999,
  size = "md",
  disabled,
}: ScoreStepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  const sizes = {
    sm: { num: "text-2xl h-10 min-w-[3rem]", btn: "h-8 w-8" },
    md: { num: "text-4xl h-14 min-w-[4rem]", btn: "h-10 w-10" },
    lg: { num: "text-5xl h-20 min-w-[5rem]", btn: "h-12 w-12" },
  }[size];

  return (
    <div className="flex flex-col items-center gap-1.5">
      {label && (
        <p className="text-xs font-medium text-muted-foreground truncate max-w-[10rem] text-center">
          {label}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={dec}
          disabled={disabled || value <= min}
          aria-label="Diminuer"
          className={cn(
            "rounded-full bg-muted text-foreground flex items-center justify-center transition active:scale-90 hover:bg-muted/70 disabled:opacity-40 disabled:cursor-not-allowed",
            sizes.btn,
          )}
        >
          <Minus className="h-4 w-4" />
        </button>
        <div
          className={cn(
            "flex items-center justify-center font-bold tabular-nums rounded-lg bg-card border border-border px-2",
            sizes.num,
          )}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={inc}
          disabled={disabled || value >= max}
          aria-label="Augmenter"
          className={cn(
            "rounded-full bg-primary text-primary-foreground flex items-center justify-center transition active:scale-90 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm",
            sizes.btn,
          )}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
