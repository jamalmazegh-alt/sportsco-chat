import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ConvocationBandProps {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  className?: string;
}

/**
 * Bande verticale verte "Convoqué" affichée sur le bord droit d'une carte
 * d'événement, pleine hauteur. Toujours affichée dès que le joueur est retenu,
 * quel que soit son statut de réponse.
 */
export function ConvocationBand({ onClick, title, className }: ConvocationBandProps) {
  const { t } = useTranslation();
  const label = title ?? t("attendance.calledUp");
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
      title={label}
      aria-label={label}
      className={cn(
        "shrink-0 self-stretch w-[80px] flex flex-col items-center justify-center gap-1.5 text-white transition-opacity active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset",
        className,
      )}
      style={{ backgroundColor: "#1D9E75" }}
    >
      <Bell size={25} strokeWidth={2} className="text-white" />
      <span className="text-[12px] font-medium leading-none">{label}</span>
    </button>
  );
}
