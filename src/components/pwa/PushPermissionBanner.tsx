import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { isAndroid, isInStandaloneMode, isPushSupported } from "@/lib/pwa";
import { subscribeToPush, syncPushSubscriptionState } from "@/lib/push-subscribe";
import { useAuth } from "@/lib/auth-context";
import { isNativePlatform } from "@/lib/native-platform";
import { enableNativePush, getNativePushStatus } from "@/lib/native-push";

const DISMISS_KEY = "clubero:push:dismissed-at";
const DISMISS_DAYS = 7;

function recentlyDismissed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_DAYS * 86400 * 1000;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : le bandeau se referme quand même en mémoire.
  }
}

/**
 * Relance d'activation des notifications.
 *
 * Le Web Push n'existe pas en WebView : la variante native passe par FCM/APNs.
 * Elle a longtemps été absente, la carte « Cet appareil » du profil étant le
 * seul point d'entrée — que personne ne visite spontanément. Un utilisateur qui
 * réinstallait perdait donc ses notifications sans qu'aucun écran ne le signale.
 */
export function PushPermissionBanner() {
  if (isNativePlatform()) return <PushPermissionBannerNative />;
  return <PushPermissionBannerWeb />;
}

function PushPermissionBannerNative() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();

  function dismiss() {
    markDismissed();
    setVisible(false);
  }

  useEffect(() => {
    if (!session?.user) return;
    if (recentlyDismissed()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // `prompt` signifie « aucun token enregistré », y compris sur Android 12 où
    // la permission est toujours accordée d'office. C'est le seul état où une
    // relance a du sens : ni permission refusée, ni notifications déjà en place.
    void getNativePushStatus().then((status) => {
      if (cancelled || status !== "prompt") return;
      timer = setTimeout(() => setVisible(true), 1500);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session?.user]);

  async function enable() {
    setLoading(true);
    try {
      const res = await enableNativePush();
      if (res.ok) {
        toast.success(t("push.toastEnabled"));
        setVisible(false);
      } else if (res.reason === "denied") {
        toast.error(t("push.toastDenied"));
        // Refus explicite : ne pas reproposer avant le délai de report.
        dismiss();
      } else {
        toast.error(`${t("push.toastImpossible")} (${res.reason ?? "inconnu"})`);
        console.warn("[native-push] banner enable KO:", res.reason);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;
  return <BannerShell loading={loading} onEnable={enable} onDismiss={dismiss} />;
}

function PushPermissionBannerWeb() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user) return;
    if (!isPushSupported()) return;

    if (Notification.permission === "granted" && (isInStandaloneMode() || isAndroid())) {
      syncPushSubscriptionState().catch((e) => console.warn("[push] background sync failed", e));
      return;
    }

    if (Notification.permission !== "default") return;
    if (recentlyDismissed()) return;
    // Show only inside installed PWA or on Android (iOS web push requires standalone)
    if (!isInStandaloneMode() && !isAndroid()) return;

    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, [session?.user]);

  function dismiss() {
    markDismissed();
    setVisible(false);
  }

  async function enable() {
    setLoading(true);
    try {
      const sub = await subscribeToPush();
      if (sub) {
        toast.success(t("push.toastEnabled"));
        setVisible(false);
      } else {
        toast.error(t("push.toastDeniedBrowser"));
        dismiss();
      }
    } catch (e) {
      console.error("[push] subscribe failed", e);
      toast.error(t("push.toastError"));
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return <BannerShell loading={loading} onEnable={enable} onDismiss={dismiss} />;
}

function BannerShell({
  loading,
  onEnable,
  onDismiss,
}: {
  loading: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-2xl border border-emerald-100 bg-white shadow-2xl p-4 flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-[#1d7a45] to-[#15583a] flex items-center justify-center text-white shadow-md">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">{t("push.bannerTitle")}</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">{t("push.bannerDesc")}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onEnable}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "..." : t("push.bannerEnable")}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-3 py-1.5 rounded-lg text-gray-600 text-xs font-semibold hover:bg-gray-100 transition"
            >
              {t("push.bannerLater")}
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("push.close")}
          onClick={onDismiss}
          className="-mr-1 -mt-1 p-1.5 rounded-lg hover:bg-gray-100 transition"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}
