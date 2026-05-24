import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import {
  getStripeConnectStatus,
  createStripeConnectAccount,
  createStripeConnectOnboardingLink,
  refreshStripeConnectStatus,
} from "@/lib/stripe-connect.functions";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import i18nInstance from "@/lib/i18n";
import { BackLink } from "@/components/back-link";

const searchSchema = z.object({
  success: z.literal("1").optional(),
  refresh: z.literal("1").optional(),
});

export const Route = createFileRoute("/_authenticated/admin/settings/payments")({
  component: PaymentsSettingsPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.adminPayments.title") },
      { name: "description", content: i18nInstance.t("meta.adminPayments.description") },
    ],
  }),
});

function PaymentsSettingsPage() {
  const { t } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const search = Route.useSearch();

  const getStatusFn = useServerFn(getStripeConnectStatus);
  const createAccountFn = useServerFn(createStripeConnectAccount);
  const onboardingLinkFn = useServerFn(createStripeConnectOnboardingLink);
  const refreshFn = useServerFn(refreshStripeConnectStatus);

  const [busy, setBusy] = useState<null | "create" | "link" | "refresh">(null);

  const q = useQuery({
    queryKey: ["stripe-connect-status", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => getStatusFn({ data: { clubId: activeClubId! } }),
  });

  // If we just returned from onboarding, pull fresh state from Stripe once.
  useEffect(() => {
    if (search.success === "1" && activeClubId && q.data?.stripeAccountId) {
      void (async () => {
        try {
          await refreshFn({ data: { clubId: activeClubId } });
          await q.refetch();
        } catch (e) {
          console.error(e);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.success, activeClubId, q.data?.stripeAccountId]);

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  if (q.isLoading || !activeClubId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const s = q.data;
  const rate = s?.hasActiveSubscription ? 3 : 5;

  async function handleActivate() {
    if (!activeClubId) return;
    setBusy("create");
    try {
      await createAccountFn({ data: { clubId: activeClubId } });
      const link = await onboardingLinkFn({ data: { clubId: activeClubId } });
      window.location.href = link.url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setBusy(null);
    }
  }

  async function handleContinueOnboarding() {
    if (!activeClubId) return;
    setBusy("link");
    try {
      const link = await onboardingLinkFn({ data: { clubId: activeClubId } });
      window.location.href = link.url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setBusy(null);
    }
  }

  async function handleRefresh() {
    if (!activeClubId) return;
    setBusy("refresh");
    try {
      await refreshFn({ data: { clubId: activeClubId } });
      await q.refetch();
      toast.success(t("common.saved"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-5 py-4 space-y-5 max-w-2xl">
      <BackLink to="/admin" label={t("common.back")} />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" />
          {t("admin.payments.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.payments.subtitle")}
        </p>
      </header>

      {/* Status card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        {!s?.stripeAccountId && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.notActivatedTitle")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("admin.payments.notActivatedHint")}
                </p>
              </div>
            </div>
            <Button onClick={handleActivate} disabled={busy !== null} className="w-full">
              {busy === "create" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {t("admin.payments.activate")}
                  <ExternalLink className="h-4 w-4" />
                </>
              )}
            </Button>
          </>
        )}

        {s?.stripeAccountId && s.status === "pending" && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/10 p-2.5">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.pending")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("admin.payments.pendingHint")}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleContinueOnboarding} disabled={busy !== null} className="flex-1">
                {busy === "link" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {t("admin.payments.completeProfile")}
                    <ExternalLink className="h-4 w-4" />
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleRefresh} disabled={busy !== null} size="icon">
                {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}

        {s?.stripeAccountId && s.status === "active" && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.active")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("admin.payments.activeHint", {
                    charges: s.chargesEnabled ? "✓" : "✗",
                    payouts: s.payoutsEnabled ? "✓" : "✗",
                  })}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={busy !== null} className="w-full">
              {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4" />{t("admin.payments.refreshStatus")}</>}
            </Button>
          </>
        )}

        {s?.stripeAccountId && (s.status === "restricted" || s.status === "disabled") && (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-destructive/10 p-2.5">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t("admin.payments.restricted")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("admin.payments.restrictedHint")}
                </p>
              </div>
            </div>
            <Button onClick={handleContinueOnboarding} disabled={busy !== null} className="w-full">
              {busy === "link" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {t("admin.payments.completeProfile")}
                  <ExternalLink className="h-4 w-4" />
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Fee info */}
      <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-2">
        <p className="text-sm font-semibold">
          {t("admin.payments.platformFee", { rate })}
        </p>
        <p className="text-xs text-muted-foreground">
          {s?.hasActiveSubscription
            ? t("admin.payments.feeReduced")
            : t("admin.payments.feeStandard")}
        </p>
      </div>
    </div>
  );
}
