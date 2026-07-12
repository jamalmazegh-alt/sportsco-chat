import { Bell, CircleCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConvocationBandStatus = "pending" | "present" | "absent" | null;

interface ConvocationBandProps {
  status: ConvocationBandStatus;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  className?: string;
}

const CONFIG = {
  pending: {
    bg: "#EF9F27",
    Icon: Bell,
    label: "Convoqué",
    sub: "à confirmer",
  },
  present: {
    bg: "#1D9E75",
    Icon: CircleCheck,
    label: "Présent",
    sub: null as string | null,
  },
  absent: {
    bg: "#E24B4A",
    Icon: X,
    label: "Absent",
    sub: "excusé",
  },
} as const;

export function ConvocationBand({ status, onClick, title, className }: ConvocationBandProps) {
  if (!status) return null;
  const cfg = CONFIG[status];
  const { Icon } = cfg;

  return (
    <button
      type="button"
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          e.stopPropagation();
          onClick(e);
        }
      }}
      title={title ?? cfg.label}
      aria-label={title ?? cfg.label}
      className={cn(
        "shrink-0 self-stretch w-[88px] flex flex-col items-center justify-center gap-1.5 text-white transition-opacity active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset",
        className,
      )}
      style={{ backgroundColor: cfg.bg }}
    >
      <Icon size={25} strokeWidth={2} className="text-white" />
      <span className="text-[12px] font-medium leading-none">{cfg.label}</span>
      {cfg.sub && (
        <span
          className="text-[10px] font-medium leading-none px-[7px] py-[2px] rounded-[10px] bg-white/25"
        >
          {cfg.sub}
        </span>
      )}
    </button>
  );
}
