import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LivePill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5",
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
        {children}
      </span>
    </div>
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
      {children}
    </p>
  );
}

export function Display({
  as: As = "h2",
  children,
  className,
}: {
  as?: "h1" | "h2" | "h3";
  children: ReactNode;
  className?: string;
}) {
  const sizes =
    As === "h1"
      ? "text-6xl sm:text-7xl md:text-8xl lg:text-9xl"
      : As === "h2"
        ? "text-4xl sm:text-5xl md:text-6xl"
        : "text-2xl sm:text-3xl";
  return (
    <As
      className={cn(
        "font-display uppercase leading-[0.88] tracking-tight text-foreground",
        sizes,
        className,
      )}
    >
      {children}
    </As>
  );
}

export function StadiumCard({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-foreground/10 bg-card",
        glow && "shadow-[0_0_40px_-10px_rgba(16,185,129,0.25)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ScoreBadge({ minute }: { minute: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-sm bg-primary px-2.5 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground stadium-blip" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
        {minute}
      </span>
    </div>
  );
}
