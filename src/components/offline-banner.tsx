import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isNativePlatform } from "@/lib/native-platform";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Bandeau « hors ligne », app native uniquement.
 *
 * Sur le web, la perte de réseau est déjà signalée par le navigateur et le
 * service worker sert `/offline`. En natif il n'y avait rien : la coquille
 * reste affichée et l'utilisateur ne voit que des chargements sans fin.
 *
 * Volontairement non bloquant — les écrans déjà chargés restent consultables.
 */
export function OfflineBanner() {
  if (!isNativePlatform()) return null;
  return <OfflineBannerNative />;
}

function OfflineBannerNative() {
  const online = useOnlineStatus();
  const { t } = useTranslation();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[110] flex items-center justify-center gap-2 bg-destructive px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-xs font-medium text-destructive-foreground"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>{t("network.offline")}</span>
    </div>
  );
}
