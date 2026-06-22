import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { dispatchSuperadminTestPush } from "@/lib/superadmin-push-test.functions";

export const Route = createFileRoute("/superadmin/settings")({
  component: SettingsPage,
});

type TestResult = Awaited<ReturnType<typeof dispatchSuperadminTestPush>>;

function SettingsPage() {
  const sendTest = useServerFn(dispatchSuperadminTestPush);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientStatus, setClientStatus] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);
    setClientStatus(null);

    // Client-side state snapshot
    const clientBits: string[] = [];
    if (typeof Notification !== "undefined") {
      clientBits.push(`Notification.permission = ${Notification.permission}`);
    } else {
      clientBits.push("Notification API indisponible");
    }
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        clientBits.push(reg ? `SW actif (scope ${reg.scope})` : "Aucun service worker enregistré");
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          clientBits.push(sub ? "Push subscription locale ✓" : "Pas de push subscription locale");
        }
      } catch (e) {
        clientBits.push(`SW erreur: ${(e as Error).message}`);
      }
    } else {
      clientBits.push("serviceWorker indisponible");
    }
    setClientStatus(clientBits.join(" · "));

    try {
      const r = await sendTest();
      setResult(r);
      console.log("[push-test:client] result", r);
    } catch (e) {
      const msg = (e as Error).message || "Erreur inconnue";
      setError(msg);
      console.error("[push-test:client] error", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Platform settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Outils superadmin — diagnostics et tests.
        </p>
      </div>

      <section className="rounded-lg border p-5 space-y-4">
        <div>
          <h2 className="font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" /> Tester une push notification
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Envoie immédiatement une notification de test à toutes vos
            subscriptions Web Push enregistrées (cet utilisateur).
          </p>
        </div>

        <Button onClick={handleClick} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Envoi…
            </>
          ) : (
            <>
              <Bell className="h-4 w-4 mr-2" /> Envoyer une push de test
            </>
          )}
        </Button>

        {clientStatus && (
          <div className="text-xs rounded bg-muted/50 p-3 font-mono whitespace-pre-wrap">
            <div className="text-muted-foreground mb-1">Côté client</div>
            {clientStatus}
          </div>
        )}

        {error && (
          <div className="text-sm rounded border border-destructive/40 bg-destructive/10 p-3">
            <div className="font-medium text-destructive">Erreur serveur</div>
            <div className="font-mono text-xs mt-1">{error}</div>
          </div>
        )}

        {result && (
          <div className="text-sm rounded border p-3 space-y-2">
            <div className="text-muted-foreground text-xs">
              Côté serveur · {new Date(result.at).toLocaleTimeString("fr-FR")}
            </div>
            <div>
              {result.ok ? (
                <span className="text-emerald-600 font-medium">
                  ✓ Envoyé à {result.sent} subscription(s)
                </span>
              ) : result.reason === "no_subscriptions" ? (
                <span className="text-amber-600 font-medium">
                  ⚠ Aucune push subscription enregistrée pour votre compte —
                  activez les notifications dans l'app d'abord.
                </span>
              ) : (
                <span className="text-destructive font-medium">
                  ✗ Échec — 0 envoi réussi sur {result.subscriptions.length} subscription(s)
                </span>
              )}
              {result.pruned > 0 && (
                <span className="text-muted-foreground"> · {result.pruned} expirée(s) supprimée(s)</span>
              )}
            </div>
            {result.subscriptions.length > 0 && (
              <ul className="text-xs font-mono space-y-1">
                {result.subscriptions.map((s) => (
                  <li key={s.endpoint} className="truncate">
                    {s.host}
                    {s.user_agent ? ` · ${s.user_agent}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
