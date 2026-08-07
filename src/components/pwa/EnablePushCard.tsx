import { useEffect, useState } from "react";
import { openInSystemApp } from "@/lib/open-url";
import { useTranslation } from "react-i18next";
import { Bell, BellOff, CheckCircle2, Loader2, Settings, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { isIOS, isInStandaloneMode, isPushSupported } from "@/lib/pwa";
import { isNativePlatform, getPlatform } from "@/lib/native-platform";
import { enableNativePush, getNativePushStatus, type NativePushStatus } from "@/lib/native-push";
import { subscribeToPush } from "@/lib/push-subscribe";

type Status = "unsupported" | "ios-needs-pwa" | "default" | "granted" | "denied";

function computeStatus(): Status {
  if (typeof window === "undefined") return "unsupported";
  if (!isPushSupported()) {
    if (isIOS() && !isInStandaloneMode()) return "ios-needs-pwa";
    return "unsupported";
  }
  if (isIOS() && !isInStandaloneMode()) return "ios-needs-pwa";
  const p = Notification.permission;
  if (p === "granted") return "granted";
  if (p === "denied") return "denied";
  return "default";
}

// App native Capacitor : le Web Push ne fonctionne pas en WKWebView — le CTA
// bascule sur l'enregistrement natif FCM/APNs (lot 3).
export function EnablePushCard() {
  if (isNativePlatform()) return <EnablePushCardNative />;
  return <EnablePushCardWeb />;
}

function EnablePushCardNative() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<NativePushStatus>("unavailable");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getNativePushStatus().then(setStatus);
  }, []);

  async function handleEnable() {
    setLoading(true);
    try {
      const res = await enableNativePush();
      if (res.ok) {
        toast.success(t("push.toastEnabled"));
        setStatus("granted");
      } else if (res.reason === "denied") {
        setStatus("denied");
        toast.error(t("push.toastDenied"));
      } else {
        // La raison est affichée à l'écran, pas seulement journalisée :
        // Capacitor supprime les journaux JS en build de release, une
        // TestFlight est donc muette et l'utilisateur — comme moi — n'avait
        // aucun moyen de savoir ce qui avait échoué.
        toast.error(`${t("push.toastImpossible")} (${res.reason ?? "inconnu"})`);
        console.warn("[native-push] enable KO:", res.reason);
      }
    } finally {
      setLoading(false);
    }
  }

  if (status === "unavailable") return null;

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="px-5 pt-4 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("push.deviceSection")}
        </h2>
      </header>
      <div className="px-5 py-4">
        {status === "granted" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("push.enabledTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("push.enabledDesc")}</p>
            </div>
          </div>
        )}

        {status === "prompt" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("push.enableTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("push.enableDesc")}</p>
              <button
                type="button"
                disabled={loading}
                onClick={handleEnable}
                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("push.enabling")}
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" /> {t("push.enableCta")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {status === "denied" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <BellOff className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("push.disabledTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t("push.disabledDesc")}
              </p>
              {/* Une permission refusée ne peut plus être redemandée : iOS
                  interdit de rouvrir la boîte de dialogue système. Les Réglages
                  sont le seul chemin, autant y emmener plutôt que de décrire
                  l'itinéraire.

                  iOS UNIQUEMENT : `app-settings:` est un schéma propre à Apple.
                  Sur Android, Capacitor tenterait un ACTION_VIEW dessus, aucune
                  application ne le gérerait, et le bouton serait mort. Ouvrir
                  les réglages de notification Android demande un Intent
                  explicite, hors de portée d'une simple URL. */}
              {getPlatform() === "ios" && (
                <button
                  type="button"
                  onClick={() => openInSystemApp("app-settings:")}
                  className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-accent transition"
                >
                  <Settings className="h-3.5 w-3.5" /> {t("push.openSettings")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function EnablePushCardWeb() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("unsupported");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setStatus(computeStatus());
  }, []);

  async function handleEnable() {
    setLoading(true);
    try {
      const sub = await subscribeToPush();
      if (sub) {
        toast.success(t("push.toastEnabled"));
        setStatus("granted");
      } else {
        const p = typeof Notification !== "undefined" ? Notification.permission : "denied";
        if (p === "denied") {
          setStatus("denied");
          toast.error(t("push.toastDeniedBrowser"));
        } else {
          toast.error(t("push.toastImpossibleShort"));
        }
      }
    } catch (e) {
      console.error("[push] enable failed", e);
      toast.error(t("push.toastError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="px-5 pt-4 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("push.deviceSection")}
        </h2>
      </header>
      <div className="px-5 py-4">
        {status === "granted" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("push.enabledTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("push.enabledDesc")}</p>
            </div>
          </div>
        )}

        {status === "default" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("push.enableTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("push.enableDesc")}</p>
              <button
                type="button"
                disabled={loading}
                onClick={handleEnable}
                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("push.enabling")}
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" /> {t("push.enableCta")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {status === "denied" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <BellOff className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("push.blockedTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t("push.blockedDesc")}
              </p>
            </div>
          </div>
        )}

        {status === "ios-needs-pwa" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("push.iosInstallTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t("push.iosInstallDesc")}
              </p>
            </div>
          </div>
        )}

        {status === "unsupported" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
              <BellOff className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("push.unsupportedTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("push.unsupportedDesc")}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
