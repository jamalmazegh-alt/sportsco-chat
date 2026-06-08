import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  listMyObligations,
  createObligationCheckout,
} from "@/lib/payment-checkout.functions";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, CreditCard, Wallet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import i18nInstance from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/payments")({
  component: MyPaymentsPage,
  validateSearch: z.object({
    success: z.string().optional(),
    cancelled: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: i18nInstance.t("meta.payments.title") },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Obligation = {
  id: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string | null;
  status: string;
  items: {
    id: string;
    title: string;
    type: string;
    due_date: string | null;
    allow_partial: boolean | null;
    status: string;
  } | null;
  clubs: {
    id: string;
    name: string;
    stripe_account_id: string | null;
    stripe_charges_enabled: boolean | null;
  } | null;
  players: { id: string; first_name: string | null; last_name: string | null } | null;
};

function formatAmount(cents: number, currency: string | null | undefined, locale: string) {
  const code = (currency || "eur").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

function MyPaymentsPage() {
  const { t, i18n } = useTranslation();
  const listFn = useServerFn(listMyObligations);

  const q = useQuery({
    queryKey: ["my-obligations"],
    queryFn: () => listFn({ data: {} }),
  });

  const search = Route.useSearch();

  return (
    <div className="px-5 py-4 space-y-5 max-w-3xl">
      <BackLink to="/home" label={t("common.back")} />

      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            {t("payments.title")}
          </h1>
          <Button variant="outline" size="sm" asChild>
            <Link to="/payments/family">{t("payments.familyView")}</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/payments/receipts">{t("payments.receipts")}</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("payments.subtitle")}
        </p>
      </header>

      {search?.success && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {t("payments.success")}
        </div>
      )}
      {search?.cancelled && (
        <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t("payments.cancelled")}
        </div>
      )}

      {q.isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {q.data && q.data.obligations.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">{t("payments.emptyTitle")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("payments.emptyHint")}
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {(q.data?.obligations as Obligation[] | undefined)?.map((o) => (
          <ObligationRow key={o.id} obligation={o} locale={i18n.language} />
        ))}
      </ul>
    </div>
  );
}

function ObligationRow({
  obligation,
  locale,
}: {
  obligation: Obligation;
  locale: string;
}) {
  const { t } = useTranslation();
  const checkoutFn = useServerFn(createObligationCheckout);
  const [partialOpen, setPartialOpen] = useState(false);
  const [amount, setAmount] = useState("");

  const remaining = obligation.amount_due_cents - obligation.amount_paid_cents;
  const currency = (obligation.currency || "eur").toUpperCase();
  const stripeReady =
    !!obligation.clubs?.stripe_account_id &&
    !!obligation.clubs?.stripe_charges_enabled;
  const allowPartial = !!obligation.items?.allow_partial;
  const playerName =
    obligation.players
      ? `${obligation.players.first_name ?? ""} ${obligation.players.last_name ?? ""}`.trim()
      : "";

  const checkout = useMutation({
    mutationFn: (cents?: number) =>
      checkoutFn({
        data: {
          obligationId: obligation.id,
          ...(cents !== undefined ? { amountCents: cents } : {}),
        },
      }),
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {obligation.items?.title ?? t("payments.defaultItem")}
            </p>
            {obligation.status === "partially_paid" && (
              <Badge variant="outline" className="text-[10px]">
                {t("payments.status.partiallyPaid")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {obligation.clubs?.name}
            {playerName ? ` · ${playerName}` : ""}
            {obligation.items?.due_date
              ? ` · ${t("payments.dueDate", { date: obligation.items.due_date })}`
              : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">
            {formatAmount(remaining, currency, locale)}
          </p>
          {obligation.amount_paid_cents > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {t("payments.alreadyPaid", {
                amount: formatAmount(obligation.amount_paid_cents, currency, locale),
              })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stripeReady ? (
          <>
            <Button
              size="sm"
              onClick={() => checkout.mutate(undefined)}
              disabled={checkout.isPending}
            >
              {checkout.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {t("payments.payAmount", { amount: formatAmount(remaining, currency, locale) })}
            </Button>
            {allowPartial && remaining > 100 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAmount(((remaining / 100) / 2).toFixed(2));
                  setPartialOpen(true);
                }}
              >
                {t("payments.partial")}
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("payments.onlineUnavailable")}
          </p>
        )}
      </div>

      <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payments.partial")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">
              {t("payments.amountLabel", { currency })}
            </Label>
            <Input
              type="number"
              min="1"
              step="0.01"
              max={(remaining / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("payments.remainingAfter", {
                amount: formatAmount(
                  remaining - Math.round(parseFloat(amount || "0") * 100),
                  currency,
                  locale,
                ),
              })}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartialOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const cents = Math.round(parseFloat(amount || "0") * 100);
                if (cents <= 0 || cents > remaining) {
                  toast.error(t("payments.invalidAmount"));
                  return;
                }
                setPartialOpen(false);
                checkout.mutate(cents);
              }}
              disabled={checkout.isPending}
            >
              {t("common.continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
