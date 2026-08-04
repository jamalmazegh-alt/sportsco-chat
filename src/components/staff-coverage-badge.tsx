// Badge de couverture staff — 3 états (assured / no assignment / no coach available).
// Utilisé dans l'en-tête de la carte « Encadrement » ; l'état est calculé
// côté parent à partir des données déjà chargées (assignments + pool + dispos).

import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type StaffCoverageState = "assured" | "unassigned" | "uncovered";

export function StaffCoverageBadge({
  state,
  className,
}: {
  state: StaffCoverageState;
  className?: string;
}) {
  const { t } = useTranslation();

  const config =
    state === "assured"
      ? {
          Icon: CheckCircle2,
          label: t("staffCoverage.badge.assured"),
          cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        }
      : state === "unassigned"
        ? {
            Icon: AlertTriangle,
            label: t("staffCoverage.badge.unassigned"),
            cls: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
          }
        : {
            Icon: AlertTriangle,
            label: t("staffCoverage.badge.uncovered"),
            cls: "border-destructive/40 bg-destructive/10 text-destructive",
          };

  const { Icon, label, cls } = config;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border shrink-0",
        cls,
        className,
      )}
      title={label}
    >
      <Icon className="h-3 w-3" strokeWidth={2.4} />
      {label}
    </span>
  );
}
