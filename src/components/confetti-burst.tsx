import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight CSS confetti burst. Mounted only when `trigger` increments.
 * Auto-unmounts after the animation completes. Respects prefers-reduced-motion.
 */
export function ConfettiBurst({ trigger }: { trigger: number }) {
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    if (trigger <= 0) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setSeed(trigger);
    const t = setTimeout(() => setSeed(0), 900);
    return () => clearTimeout(t);
  }, [trigger]);

  if (seed === 0) return null;

  const pieces = Array.from({ length: 18 });
  const colors = [
    "bg-emerald-500",
    "bg-amber-400",
    "bg-rose-500",
    "bg-sky-500",
    "bg-fuchsia-500",
    "bg-lime-400",
  ];

  return (
    <div
      key={seed}
      className="pointer-events-none fixed inset-0 z-[100] overflow-hidden"
      aria-hidden
    >
      <div className="absolute left-1/2 top-1/3 -translate-x-1/2">
        {pieces.map((_, i) => {
          const angle = (360 / pieces.length) * i + (seed % 30);
          const dist = 80 + ((i * 13) % 60);
          const dx = Math.cos((angle * Math.PI) / 180) * dist;
          const dy = Math.sin((angle * Math.PI) / 180) * dist;
          return (
            <span
              key={i}
              className={cn(
                "absolute h-2 w-2 rounded-sm",
                colors[i % colors.length],
              )}
              style={{
                left: 0,
                top: 0,
                animation: `confetti-fly 800ms cubic-bezier(.2,.7,.3,1) forwards`,
                ["--dx" as any]: `${dx}px`,
                ["--dy" as any]: `${dy}px`,
                ["--rot" as any]: `${(i * 47) % 360}deg`,
              }}
            />
          );
        })}
      </div>
      <style>{`
        @keyframes confetti-fly {
          0%   { transform: translate(0,0) rotate(0); opacity: 1; }
          70%  { opacity: 1; }
          100% { transform: translate(var(--dx), calc(var(--dy) + 80px)) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
