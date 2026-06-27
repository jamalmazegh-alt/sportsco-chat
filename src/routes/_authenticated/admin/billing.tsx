import { createFileRoute, Link, Navigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import {
  getClubSubscription,
  createCheckoutSession,
  createPortalSession,
  syncClubSubscriptionFromStripe,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  listClubInvoices,
} from "@/lib/billing.functions";
import { UpdateCardDialog } from "@/components/billing/update-card-dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Sparkles,
  Check,
  ExternalLink,
  AlertCircle,
  CreditCard,
  FileText,
  XCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { EXEMPT_REASON_LABELS, type ExemptReason } from "@/lib/has-paid-access";

const searchSchema = z.object({
  billing: z.enum(["success", "canceled"]).optional(),
  card: z.literal("updated").optional(),
});

import i18nInstance from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: BillingPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.adminBilling.title") },
      { name: "description", content: i18nInstance.t("meta.adminBilling.description") },
    ],
  }),
});

function StatusBadge({ status, trialEnd }: { status: string; trialEnd: string | null }) {
  const { t, i18n } = useTranslation();
  const trialTime = trialEnd ? new Date(trialEnd).getTime() : null;
  const trialExpired = status === "trialing" && trialTime !== null && trialTime <= Date.now();
  const map: Record<string, { label: string; cls: string }> = {
    trialing: { label: t("billing.statusTrialing"), cls: "bg-primary/10 text-primary" },
    active: {
      label: t("billing.statusActive"),
      cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    past_due: {
      label: t("billing.statusPastDue"),
      cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    canceled: { label: t("billing.statusCanceled"), cls: "bg-muted text-muted-foreground" },
    incomplete: { label: t("billing.statusIncomplete"), cls: "bg-muted text-muted-foreground" },
    incomplete_expired: {
      label: t("billing.statusIncompleteExpired"),
      cls: "bg-destructive/10 text-destructive",
    },
    unpaid: { label: t("billing.statusUnpaid"), cls: "bg-destructive/10 text-destructive" },
    paused: { label: t("billing.statusPaused"), cls: "bg-muted text-muted-foreground" },
  };
  const s = trialExpired
    ? { label: t("billing.statusTrialExpired"), cls: "bg-destructive/10 text-destructive" }
    : (map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" });
  const locale = i18n.language?.startsWith("fr") ? "fr-FR" : "en-US";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}
    >
      {s.label}
      {status === "trialing" && trialEnd && (
        <>
          {" · "}
          {t(trialExpired ? "billing.endedOnDate" : "billing.untilDate", {
            date: new Date(trialEnd).toLocaleDateString(locale),
          })}
        </>
      )}
    </span>
  );
}

function BillingPage() {
  const { t, i18n } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const search = useSearch({ from: "/_authenticated/admin/billing" });
  const locale = i18n.language?.startsWith("fr") ? "fr-FR" : "en-US";

  function formatAmount(cents: number, currency: string) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  }

  const fetchSub = useServerFn(getClubSubscription);
  const checkout = useServerFn(createCheckoutSession);
  const portal = useServerFn(createPortalSession);
  const syncSubscription = useServerFn(syncClubSubscriptionFromStripe);
  const cancelSub = useServerFn(cancelSubscriptionAtPeriodEnd);
  const reactivate = useServerFn(reactivateSubscription);
  const fetchInvoices = useServerFn(listClubInvoices);

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [updateCardOpen, setUpdateCardOpen] = useState(false);
  const checkoutReturnSynced = useRef<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["club-subscription-full", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => fetchSub({ data: { clubId: activeClubId! } }),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (search.billing === "success") {
      const syncKey = activeClubId ? `success:${activeClubId}` : "success:no-club";
      if (checkoutReturnSynced.current === syncKey) return;
      checkoutReturnSynced.current = syncKey;
      toast.success(t("billing.toastActivated"));
      if (!activeClubId) return;
      syncSubscription({ data: { clubId: activeClubId } })
        .then(() => refetch())
        .catch(() => refetch());
    } else if (search.billing === "canceled") {
      toast.info(t("billing.toastCanceledPayment"));
    } else if (search.card === "updated") {
      toast.success(t("billing.toastCardUpdated"));
    }
  }, [activeClubId, refetch, search.billing, search.card, syncSubscription, t]);

  const sub = data?.subscription;
  const isExempt = sub?.exempt_from_billing === true;
  const now = Date.now();
  const trialEndTime = sub?.trial_end ? new Date(sub.trial_end).getTime() : null;
  const trialStillValid = sub?.status === "trialing" && trialEndTime !== null && trialEndTime > now;
  const trialExpired = sub?.status === "trialing" && trialEndTime !== null && trialEndTime <= now;
  const hasStripeSubscription = !!sub?.hasStripeSubscription;
  const canManageSubscription =
    !!sub &&
    hasStripeSubscription &&
    (["active", "past_due"].includes(sub.status) || trialStillValid);
  const showPlans = !isExempt && !canManageSubscription;

  const { data: invoicesData } = useQuery({
    queryKey: ["club-invoices", activeClubId],
    enabled: !!activeClubId && canManageSubscription,
    queryFn: () => fetchInvoices({ data: { clubId: activeClubId! } }),
  });

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  if (isLoading || !activeClubId || (!!activeClubId && data === undefined)) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  function navigateExternal(url: string) {
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = url;
  }

  async function startCheckout(plan: "monthly" | "yearly") {
    if (!activeClubId) return;
    setBusy(plan);
    try {
      const res = await checkout({ data: { clubId: activeClubId, plan } });
      if (res.url) navigateExternal(res.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("billing.errorCheckout"));
      setBusy(null);
    }
  }

  async function openPortal() {
    if (!activeClubId) return;
    setBusy("portal");
    try {
      const res = await portal({ data: { clubId: activeClubId } });
      if (res.url) navigateExternal(res.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("billing.errorPortal"));
      setBusy(null);
    }
  }

  async function onCancel() {
    if (!activeClubId) return;
    setBusy("cancel");
    try {
      await cancelSub({ data: { clubId: activeClubId } });
      toast.success(t("billing.toastCanceled"));
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("billing.errorCancel"));
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  }

  async function onReactivate() {
    if (!activeClubId) return;
    setBusy("reactivate");
    try {
      await reactivate({ data: { clubId: activeClubId } });
      toast.success(t("billing.toastReactivated"));
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("billing.errorReactivate"));
    } finally {
      setBusy(null);
    }
  }

  function onUpdateCard() {
    if (!activeClubId) return;
    setBusy("card");
    setUpdateCardOpen(true);
  }

  function onUpdateCardDialogChange(open: boolean) {
    setUpdateCardOpen(open);
    if (!open) setBusy((b) => (b === "card" ? null : b));
  }

  const cancelDate = (sub as any)?.cancel_at ?? sub?.current_period_end ?? sub?.trial_end ?? null;
  const scheduledCancel = sub && (sub.cancel_at_period_end || (sub as any).cancel_at);

  const FEATURES = [
    t("billing.features.teams"),
    t("billing.features.players"),
    t("billing.features.matches"),
    t("billing.features.training"),
    t("billing.features.attendance"),
    t("billing.features.comms"),
    t("billing.features.notifications"),
    t("billing.features.stats"),
    t("billing.features.events"),
    t("billing.features.pwa"),
    t("billing.features.roles"),
  ];

  return (
    <div className="px-5 py-4 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("billing.subtitle")}</p>
      </div>

      {isExempt && (
        <section
          className="rounded-2xl p-5 space-y-2 border-[1.5px] border-[#86efac]"
          style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #f8fffe 100%)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-white shadow-md"
              style={{ background: "linear-gradient(135deg, #1d7a45 0%, #2d9d5f 100%)" }}
            >
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">✅ Accès offert</h2>
              <p className="text-sm text-gray-600 mt-1">
                Votre club bénéficie d&apos;un accès gratuit à toutes les fonctionnalités Clubero.
              </p>
              {sub?.exempt_reason && (
                <p className="text-xs text-gray-500 mt-2">
                  Raison :{" "}
                  {EXEMPT_REASON_LABELS[sub.exempt_reason as ExemptReason] ?? sub.exempt_reason}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {!isExempt && (
        <>
          {/* Current status */}
          <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground">{t("billing.status")}</p>
                <div className="mt-1.5">
                  {sub ? (
                    <StatusBadge status={sub.status} trialEnd={sub.trial_end} />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("billing.noSubscription")}
                    </span>
                  )}
                </div>
              </div>
              {sub?.plan && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t("billing.plan")}</p>
                  <p className="font-semibold mt-1.5">
                    {sub.plan === "yearly" ? t("billing.planYearly") : t("billing.planMonthly")}
                  </p>
                </div>
              )}
            </div>

            {scheduledCancel && cancelDate ? (
              <div className="text-sm flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                {t("billing.scheduledCancel", {
                  date: new Date(cancelDate).toLocaleDateString(locale),
                })}
              </div>
            ) : sub?.current_period_end ? (
              <div className="text-sm text-muted-foreground">
                {t("billing.nextRenewal", {
                  date: new Date(sub.current_period_end).toLocaleDateString(locale),
                })}
              </div>
            ) : null}

            {trialExpired && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {t("billing.trialExpiredSubscribeHint")}
              </div>
            )}

            {canManageSubscription && (
              <div className="grid gap-2 sm:grid-cols-2 pt-1">
                <Button
                  onClick={onUpdateCard}
                  variant="outline"
                  disabled={busy === "card"}
                  className="w-full"
                >
                  {busy === "card" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      {t("billing.updateCard")}
                    </>
                  )}
                </Button>

                {scheduledCancel ? (
                  <Button
                    onClick={onReactivate}
                    variant="outline"
                    disabled={busy === "reactivate"}
                    className="w-full"
                  >
                    {busy === "reactivate" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4" />
                        {t("billing.reactivate")}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setConfirmCancel(true)}
                    variant="outline"
                    disabled={busy === "cancel"}
                    className="w-full text-destructive hover:text-destructive"
                  >
                    <XCircle className="h-4 w-4" />
                    {t("billing.cancel")}
                  </Button>
                )}
              </div>
            )}

            {canManageSubscription && (
              <button
                onClick={openPortal}
                disabled={busy === "portal"}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
              >
                {busy === "portal" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    {t("billing.advancedPortal")} <ExternalLink className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </section>

          {/* Invoices */}
          {canManageSubscription && invoicesData?.invoices && invoicesData.invoices.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">{t("billing.invoices")}</h2>
              </div>
              <ul className="divide-y divide-border">
                {invoicesData.invoices.map((inv) => (
                  <li key={inv.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {inv.number ?? inv.id}
                        {inv.status === "paid" && (
                          <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                            {t("billing.invoicePaid")}
                          </span>
                        )}
                        {inv.status === "open" && (
                          <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                            {t("billing.invoiceOpen")}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(inv.created * 1000).toLocaleDateString(locale)} ·{" "}
                        {formatAmount(inv.amount_paid || inv.amount_due, inv.currency)}
                      </p>
                    </div>
                    {inv.invoice_pdf && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          try {
                            const res = await fetch(inv.invoice_pdf!, { mode: "cors" });
                            if (!res.ok) throw new Error("download_failed");
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `${inv.number ?? inv.id}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          } catch {
                            // Fallback: noopener prevents the iframe parent from being replaced
                            window.open(inv.invoice_pdf!, "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        PDF <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Plans (when not active) */}
          {showPlans && (
            <section className="rounded-2xl border border-primary bg-card p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">CLUBERO</h2>
                  <p className="text-sm text-muted-foreground">{t("billing.allInclusive")}</p>
                </div>
              </div>

              <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-sm">
                <p className="font-medium text-primary">{t("billing.trialBadge")}</p>
                <p className="text-muted-foreground mt-1">{t("billing.trialDescription")}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => startCheckout("monthly")}
                  disabled={busy !== null}
                  className="rounded-xl border-2 border-border hover:border-primary p-4 text-left transition-colors disabled:opacity-50"
                >
                  <p className="text-sm text-muted-foreground">{t("billing.monthly")}</p>
                  <p className="font-display text-2xl font-bold mt-1">49 €</p>
                  <p className="text-xs text-muted-foreground">{t("billing.perMonth")}</p>
                  <span className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                    {t("billing.subscribeMonthly")}
                  </span>
                  {busy === "monthly" && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
                </button>
                <button
                  onClick={() => startCheckout("yearly")}
                  disabled={busy !== null}
                  className="rounded-xl border-2 border-primary bg-primary/5 p-4 text-left relative disabled:opacity-50"
                >
                  <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {t("billing.twoMonthsFree")}
                  </span>
                  <p className="text-sm text-muted-foreground">{t("billing.yearly")}</p>
                  <p className="font-display text-2xl font-bold mt-1">490 €</p>
                  <p className="text-xs text-muted-foreground">{t("billing.perYear")}</p>
                  <span className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                    {t("billing.subscribeYearly")}
                  </span>
                  {busy === "yearly" && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center -mt-1">
                {t("billing.taxNotice")}
              </p>

              <p className="text-xs text-muted-foreground text-center">
                <Trans
                  i18nKey="billing.termsNotice"
                  t={t}
                  components={{
                    1: (
                      <Link
                        to="/legal/$kind"
                        params={{ kind: "terms" }}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-foreground"
                      />
                    ),
                    3: (
                      <Link
                        to="/legal/$kind"
                        params={{ kind: "privacy" }}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-foreground"
                      />
                    ),
                  }}
                />
              </p>

              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2 border-t border-border">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <UpdateCardDialog
        open={updateCardOpen}
        onOpenChange={onUpdateCardDialogChange}
        clubId={activeClubId}
        onSuccess={() => refetch()}
      />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("billing.confirmCancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("billing.confirmCancelBody", {
                date: cancelDate
                  ? new Date(cancelDate).toLocaleDateString(locale)
                  : t("billing.confirmCancelFallbackDate"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "cancel"}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onCancel();
              }}
              disabled={busy === "cancel"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy === "cancel" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("billing.confirmCancelAction")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
