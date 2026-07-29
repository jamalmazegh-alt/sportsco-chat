import { useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type SwipeToDismissProps = {
  onDismiss: () => void;
  disabled?: boolean;
  label?: string;
  children: ReactNode;
};

const THRESHOLD = 96;

/** Swipe a card to the right to trigger an action (mark as read). Touch/pointer friendly. */
export function SwipeToDismiss({ onDismiss, disabled, label, children }: SwipeToDismissProps) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef(false);
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);

  function reset() {
    startX.current = null;
    startY.current = null;
    locked.current = false;
    setOffset(0);
  }

  if (disabled) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 flex w-full items-center gap-2 rounded-2xl bg-emerald-500/15 pl-4 text-emerald-600 transition-opacity dark:text-emerald-400",
          offset > 8 || leaving ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="h-4 w-4" />
        {label && <span className="text-xs font-medium">{label}</span>}
      </div>
      <div
        style={{ transform: `translateX(${leaving ? "110%" : `${offset}px`})` }}
        className={cn(
          "relative touch-pan-y",
          (offset === 0 || leaving) && "transition-transform duration-200",
        )}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          startX.current = e.clientX;
          startY.current = e.clientY;
        }}
        onPointerMove={(e) => {
          if (startX.current === null || startY.current === null) return;
          const dx = e.clientX - startX.current;
          const dy = e.clientY - startY.current;
          if (!locked.current) {
            if (Math.abs(dy) > Math.abs(dx)) {
              reset();
              return;
            }
            if (Math.abs(dx) < 8) return;
            locked.current = true;
          }
          setOffset(Math.max(0, Math.min(dx, 160)));
        }}
        onPointerUp={() => {
          if (offset >= THRESHOLD) {
            setLeaving(true);
            window.setTimeout(onDismiss, 180);
          }
          reset();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}
