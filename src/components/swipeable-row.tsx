import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { cn } from "@/lib/utils";

export interface SwipeAction {
  label: string;
  icon?: ReactNode;
  variant?: "default" | "destructive";
  onClick: () => void;
}

interface Props {
  children: ReactNode;
  actions: SwipeAction[];
  disabled?: boolean;
  className?: string;
}

const ACTION_WIDTH = 76; // px per action

/**
 * iOS-style swipe-left row. Reveals action buttons on swipe.
 * Touch only — pointer/keyboard users still get the inline buttons elsewhere.
 */
export function SwipeableRow({ children, actions, disabled, className }: Props) {
  const [offset, setOffset] = useState(0); // negative = revealed
  const startX = useRef<number | null>(null);
  const startOffset = useRef(0);
  const maxReveal = -ACTION_WIDTH * actions.length;

  function onTouchStart(e: TouchEvent) {
    if (disabled || actions.length === 0) return;
    startX.current = e.touches[0].clientX;
    startOffset.current = offset;
  }

  function onTouchMove(e: TouchEvent) {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const next = Math.min(0, Math.max(maxReveal - 30, startOffset.current + dx));
    setOffset(next);
  }

  function onTouchEnd() {
    if (startX.current === null) return;
    startX.current = null;
    // Snap: open if revealed > half of one action, else close
    if (offset < -ACTION_WIDTH / 2) setOffset(maxReveal);
    else setOffset(0);
  }

  function close() {
    setOffset(0);
  }

  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {/* Action buttons sit underneath, revealed by translating the content. */}
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: ACTION_WIDTH * actions.length }}
        aria-hidden={offset === 0}
      >
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              a.onClick();
              close();
            }}
            className={cn(
              "h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              a.variant === "destructive"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground",
            )}
            style={{ width: ACTION_WIDTH }}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      <div
        className="relative bg-card transition-transform duration-200 ease-out touch-pan-y"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (offset !== 0) close();
        }}
      >
        {children}
      </div>
    </div>
  );
}
