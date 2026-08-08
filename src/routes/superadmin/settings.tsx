import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { dispatchSuperadminTestPush } from "@/lib/superadmin-push-test.functions";
import { VenueGeocodePanel } from "@/components/superadmin/VenueGeocodePanel";

export const Route = createFileRoute("/superadmin/settings")({
  component: SettingsPage,
});

type TestResult = Awaited<ReturnType<typeof dispatchSuperadminTestPush>>;

function SettingsPage() {
  const { t } = useTranslation();
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
      clientBits.push(t("superadmin.settings.notifApiUnavailable"));
    }
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        clientBits.push(
          reg
            ? t("superadmin.settings.swActive", { scope: reg.scope })
            : t("superadmin.settings.noSw"),
        );
        if (reg) {
          if (!("pushManager" in reg) || !reg.pushManager) {
            clientBits.push(t("superadmin.settings.pushManagerUnavailable"));
          } else {
            const sub = await reg.pushManager.getSubscription();
            clientBits.push(
              sub ? t("superadmin.settings.localPushOk") : t("superadmin.settings.noLocalPush"),
            );
          }
        }
      } catch (e) {
        clientBits.push(t("superadmin.settings.swError", { message: (e as Error).message }));
      }
    } else {
      clientBits.push(t("superadmin.settings.swUnavailable"));
    }
    setClientStatus(clientBits.join(" · "));

    try {
      const r = await sendTest();
      setResult(r);
      console.log("[push-test:client] result", r);
    } catch (e) {
      const msg = (e as Error).message || t("superadmin.settings.unknownError");
      setError(msg);
      console.error("[push-test:client] error", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{t("superadmin.settings.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("superadmin.settings.subtitle")}</p>
      </div>

      <section className="rounded-lg border p-5 space-y-4">
        <div>
          <h2 className="font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" /> {t("superadmin.settings.pushTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("superadmin.settings.pushHint")}</p>
        </div>

        <Button onClick={handleClick} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("superadmin.settings.sending")}
            </>
          ) : (
            <>
              <Bell className="h-4 w-4 mr-2" /> {t("superadmin.settings.sendTest")}
            </>
          )}
        </Button>

        {clientStatus && (
          <div className="text-xs rounded bg-muted/50 p-3 font-mono whitespace-pre-wrap">
            <div className="text-muted-foreground mb-1">{t("superadmin.settings.clientSide")}</div>
            {clientStatus}
          </div>
        )}

        {error && (
          <div className="text-sm rounded border border-destructive/40 bg-destructive/10 p-3">
            <div className="font-medium text-destructive">
              {t("superadmin.settings.serverError")}
            </div>
            <div className="font-mono text-xs mt-1">{error}</div>
          </div>
        )}

        {result && (
          <div className="text-sm rounded border p-3 space-y-2">
            <div className="text-muted-foreground text-xs">
              {t("superadmin.settings.serverSide")} · {new Date(result.at).toLocaleTimeString()}
            </div>
            <div>
              {result.ok ? (
                <span className="text-emerald-600 font-medium">
                  {t("superadmin.settings.sentTo", { count: result.sent })}
                </span>
              ) : result.reason === "no_subscriptions" ? (
                <span className="text-amber-600 font-medium">
                  {t("superadmin.settings.noSubscriptions")}
                </span>
              ) : (
                <span className="text-destructive font-medium">
                  {t("superadmin.settings.sendFailed", { count: result.subscriptions.length })}
                </span>
              )}
              {result.pruned > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  {t("superadmin.settings.pruned", { count: result.pruned })}
                </span>
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

      <VenueGeocodePanel />
    </div>
  );
}
