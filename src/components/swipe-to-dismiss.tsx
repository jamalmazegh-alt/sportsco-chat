import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef(false);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || disabled) return;

    function apply(value: number) {
      offsetRef.current = value;
      setOffset(value);
    }

    function reset() {
      startX.current = null;
      startY.current = null;
      locked.current = false;
      apply(0);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      locked.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (startX.current === null || startY.current === null) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!locked.current) {
        if (Math.abs(dx) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          reset();
          return;
        }
        locked.current = true;
      }
      // Prevent iOS from scrolling / triggering edge-swipe navigation mid-gesture.
      if (e.cancelable) e.preventDefault();
      apply(Math.max(0, Math.min(dx, 160)));
    }

    function onTouchEnd() {
      if (offsetRef.current >= THRESHOLD) {
        setLeaving(true);
        window.setTimeout(() => onDismissRef.current(), 180);
      }
      reset();
    }

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd);
    node.addEventListener("touchcancel", reset);
    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", reset);
    };
  }, [disabled]);

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
        ref={nodeRef}
        style={{
          transform: `translateX(${leaving ? "110%" : `${offset}px`})`,
          touchAction: "pan-y",
        }}
        className={cn("relative", (offset === 0 || leaving) && "transition-transform duration-200")}
      >
        {children}
      </div>
    </div>
  );
}
