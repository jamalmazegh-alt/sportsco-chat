import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { isAndroid, isInStandaloneMode, isPushSupported } from "@/lib/pwa";
import { subscribeToPush } from "@/lib/push-subscribe";
import { useAuth } from "@/lib/auth-context";

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

export function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user) return;
    if (!isPushSupported()) return;

    if (Notification.permission === "granted" && (isInStandaloneMode() || isAndroid())) {
      subscribeToPush().catch((e) => console.warn("[push] background sync failed", e));
      return;
    }

    if (Notification.permission !== "default") return;
    if (recentlyDismissed()) return;
    // Show only inside installed PWA or on Android (iOS web push requires standalone)
    if (!isInStandaloneMode() && !isAndroid()) return;

    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, [session?.user]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  }

  async function enable() {
    setLoading(true);
    try {
      const sub = await subscribeToPush();
      if (sub) {
        toast.success("Notifications activées");
        setVisible(false);
      } else {
        toast.error("Notifications refusées ou non disponibles");
        dismiss();
      }
    } catch (e) {
      console.error("[push] subscribe failed", e);
      toast.error("Erreur lors de l'activation");
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-2xl border border-emerald-100 bg-white shadow-2xl p-4 flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-[#1d7a45] to-[#15583a] flex items-center justify-center text-white shadow-md">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">Activez les notifications</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-snug">
            Recevez vos convocations et rappels en temps réel
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={enable}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "..." : "Activer"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg text-gray-600 text-xs font-semibold hover:bg-gray-100 transition"
            >
              Plus tard
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Fermer"
          onClick={dismiss}
          className="-mr-1 -mt-1 p-1.5 rounded-lg hover:bg-gray-100 transition"
        >
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
}
