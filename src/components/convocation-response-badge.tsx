import { Clock, CircleCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type ConvocationResponse = "pending" | "present" | "absent";

interface ResponseBadgeProps {
  response: ConvocationResponse;
  className?: string;
}

const CONFIG: Record<
  ConvocationResponse,
  { bg: string; fg: string; Icon: typeof Clock; labelKey: string }
> = {
  pending: { bg: "#FAEEDA", fg: "#854F0B", Icon: Clock, labelKey: "attendance.toConfirm" },
  present: { bg: "#E1F5EE", fg: "#0F6E56", Icon: CircleCheck, labelKey: "attendance.present" },
  absent: { bg: "#FCEBEB", fg: "#A32D2D", Icon: X, labelKey: "attendance.absent" },
};

/**
 * Pastille compacte de réponse du joueur (à confirmer / présent / absent).
 * S'affiche à côté de la date sur les cartes d'événement.
 */
export function ConvocationResponseBadge({ response, className }: ResponseBadgeProps) {
  const { t } = useTranslation();
  const cfg = CONFIG[response];
  const { Icon } = cfg;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-[20px] font-medium", className)}
      style={{
        backgroundColor: cfg.bg,
        color: cfg.fg,
        padding: "4px 9px",
        fontSize: "11px",
        lineHeight: 1,
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {t(cfg.labelKey)}
    </span>
  );
}
