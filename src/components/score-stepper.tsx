import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoreStepperProps {
  value: number;
  onChange: (next: number) => void;
  label?: string;
  min?: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  /** Upgrade md→lg on sm+ screens (keeps mobile compact). */
  responsiveLg?: boolean;
  disabled?: boolean;
}

const GREEN_GRADIENT = "linear-gradient(135deg,#16a34a 0%,#15803d 100%)";

/**
 * Big tap-friendly score input with +/- buttons surrounding a large numeric display.
 * Designed for referees entering scores on mobile during matches.
 * Anime Premium design tokens.
 */
export function ScoreStepper({
  value,
  onChange,
  label,
  min = 0,
  max = 999,
  size = "md",
  responsiveLg = false,
  disabled,
}: ScoreStepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  const sizes = {
    sm: { num: "text-2xl h-11 min-w-[3rem] rounded-xl", btn: "h-9 w-9", icon: "h-3.5 w-3.5" },
    md: responsiveLg
      ? {
          num: "text-4xl sm:text-6xl h-16 sm:h-24 min-w-[3.5rem] sm:min-w-[5.5rem] rounded-2xl",
          btn: "h-10 w-10 sm:h-14 sm:w-14",
          icon: "h-4 w-4 sm:h-5 sm:w-5",
        }
      : { num: "text-4xl h-16 min-w-[4.5rem] rounded-2xl", btn: "h-11 w-11", icon: "h-4 w-4" },
    lg: {
      num: "text-6xl h-24 min-w-[5.5rem] rounded-2xl",
      btn: "h-14 w-14",
      icon: "h-5 w-5",
    },
  }[size];

  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <p className="max-w-[10rem] truncate text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={dec}
          disabled={disabled || value <= min}
          aria-label="Diminuer"
          className={cn(
            "flex items-center justify-center rounded-full border-[1.5px] border-slate-200 bg-white text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
            sizes.btn,
          )}
        >
          <Minus className={sizes.icon} strokeWidth={3} />
        </button>
        <div
          className={cn(
            "flex items-center justify-center border-[1.5px] border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3 font-black tabular-nums text-slate-900 transition-all dark:border-slate-700 dark:from-slate-900 dark:to-slate-950 dark:text-slate-50",
            value > 0 && "border-emerald-500/40",
            sizes.num,
          )}
          style={{ boxShadow: "0 2px 8px -2px rgba(15,23,42,.08)" }}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={inc}
          disabled={disabled || value >= max}
          aria-label="Augmenter"
          className={cn(
            "flex items-center justify-center rounded-full text-white transition-all hover:-translate-y-0.5 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0",
            sizes.btn,
          )}
          style={{
            background: GREEN_GRADIENT,
            boxShadow: disabled ? undefined : "0 4px 12px -2px rgba(22,163,74,.45)",
          }}
        >
          <Plus className={sizes.icon} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
