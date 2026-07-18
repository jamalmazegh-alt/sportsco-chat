import { Eye, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { useCallUpVisibilityGate } from "@/hooks/use-call-up-visibility";
import { cn } from "@/lib/utils";

/**
 * Two explicit states — never mute. Reads the effective visibility from
 * the server via `call_up_list_visible`; no client-side cascade is computed
 * here (that logic was banned in Lot A).
 */
export function CallUpVisibilityBadge({
  eventId,
  className,
}: {
  eventId: string;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const { data, isLoading, isError } = useCallUpVisibilityGate(eventId);

  if (isLoading || isError || data === undefined) return null;

  if (data) {
    return (
      <Badge
        variant="secondary"
        className={cn("gap-1", className)}
        aria-label={t("callUpList.visible")}
      >
        <Eye className="h-3 w-3" aria-hidden />
        {t("callUpList.visible")}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1", className)}
      aria-label={t("callUpList.maskedBadge")}
    >
      <Lock className="h-3 w-3" aria-hidden />
      {t("callUpList.maskedBadge")}
    </Badge>
  );
}
