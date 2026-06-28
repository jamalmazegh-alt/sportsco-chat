import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { isIOS, isInStandaloneMode, isPushSupported } from "@/lib/pwa";
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

export function EnablePushCard() {
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
        toast.success("Notifications activées");
        setStatus("granted");
      } else {
        const p = typeof Notification !== "undefined" ? Notification.permission : "denied";
        if (p === "denied") {
          setStatus("denied");
          toast.error("Notifications refusées par le navigateur");
        } else {
          toast.error("Activation impossible");
        }
      }
    } catch (e) {
      console.error("[push] enable failed", e);
      toast.error("Erreur lors de l'activation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="px-5 pt-4 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Cet appareil
        </h2>
      </header>
      <div className="px-5 py-4">
        {status === "granted" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Notifications activées</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vous recevrez les push de Clubero sur cet appareil.
              </p>
            </div>
          </div>
        )}

        {status === "default" && (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Activer les notifications</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recevez convocations, rappels et actualités du club en temps réel.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={handleEnable}
                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-br from-[#1d7a45] to-[#15583a] text-white text-xs font-semibold shadow-sm hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Activation…
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5" /> Activer les notifications
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
              <p className="text-sm font-medium">Notifications bloquées</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Votre navigateur bloque les notifications pour Clubero. Pour les réactiver, cliquez
                sur l'icône cadenas 🔒 à gauche de la barre d'adresse → <b>Notifications</b> →{" "}
                <b>Autoriser</b>, puis rechargez la page.
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
              <p className="text-sm font-medium">Installez Clubero sur iPhone</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Sur iOS, les notifications ne fonctionnent qu'à partir de l'app installée. Dans
                Safari : bouton <b>Partager</b> → <b>Sur l'écran d'accueil</b>, puis ouvrez Clubero
                depuis l'icône pour activer les notifications.
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
              <p className="text-sm font-medium">Notifications indisponibles</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ce navigateur ne prend pas en charge les notifications push.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
