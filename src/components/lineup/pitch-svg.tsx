import { cn } from "@/lib/utils";

/**
 * Vertical football pitch SVG background. The container is positioned `relative`
 * so absolute-positioned player slots can use percentage coordinates over it.
 */
export function PitchSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 150"
      preserveAspectRatio="none"
      className={cn("absolute inset-0 h-full w-full", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f7a3a" />
          <stop offset="100%" stopColor="#155e2c" />
        </linearGradient>
        <pattern id="stripes" width="100" height="15" patternUnits="userSpaceOnUse">
          <rect width="100" height="15" fill="url(#grass)" />
          <rect width="100" height="7.5" fill="#0c0c0c08" />
        </pattern>
      </defs>
      <rect width="100" height="150" fill="url(#stripes)" />
      <g fill="none" stroke="#ffffff" strokeWidth="0.5" opacity="0.9">
        {/* outer */}
        <rect x="2" y="2" width="96" height="146" />
        {/* halfway */}
        <line x1="2" y1="75" x2="98" y2="75" />
        <circle cx="50" cy="75" r="9" />
        <circle cx="50" cy="75" r="0.6" fill="#fff" />
        {/* top penalty area */}
        <rect x="20" y="2" width="60" height="18" />
        <rect x="35" y="2" width="30" height="7" />
        <circle cx="50" cy="14" r="0.6" fill="#fff" />
        {/* bottom penalty area */}
        <rect x="20" y="130" width="60" height="18" />
        <rect x="35" y="141" width="30" height="7" />
        <circle cx="50" cy="136" r="0.6" fill="#fff" />
        {/* arcs */}
        <path d="M 41 20 A 9 9 0 0 0 59 20" />
        <path d="M 41 130 A 9 9 0 0 1 59 130" />
      </g>
    </svg>
  );
}
