import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { listFamilyPayments } from "@/lib/payment-family.functions";
import {
  createObligationCheckout,
} from "@/lib/payment-checkout.functions";
import { getReceiptDownloadUrl } from "@/lib/payment-receipts.functions";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Users,
  CreditCard,
  Download,
  Loader2,
  Receipt as ReceiptIcon,
  CheckCircle2,
  AlertCircle,
  Ban,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import i18nInstance from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/payments/family")({
  component: FamilyPortalPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("meta.payments.family", {
          defaultValue: "Portail famille",
        }),
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Tx = {
  id: string;
  method: string;
  status: string;
  amount_gross_cents: number;
  amount_net_cents: number | null;
  refunded_amount_cents: number | null;
  currency: string | null;
  paid_at: string | null;
  created_at: string;
};
type Rc = {
  id: string;
  receipt_number: number;
  amount_gross_cents: number;
  currency: string;
  method: string;
  issued_at: string;
};
type Obligation = {
  id: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string | null;
  status: string;
  exemption_reason: string | null;
  cancellation_reason: string | null;
  items: {
    id: string;
    title: string;
    type: string;
    due_date: string | null;
    allow_partial: boolean | null;
  } | null;
  clubs: {
    id: string;
    name: string;
    stripe_account_id: string | null;
    stripe_charges_enabled: boolean | null;
  } | null;
  players: { id: string; first_name: string | null; last_name: string | null } | null;
  transactions: Tx[];
  receipts: Rc[];
};
type Group = {
  key: string;
  label: string;
  player_id: string | null;
  obligations: Obligation[];
  totals: { due_cents: number; paid_cents: number; remaining_cents: number };
};

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "À payer",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: AlertCircle,
  },
  partially_paid: {
    label: "Partiellement payé",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    icon: AlertCircle,
  },
  paid: {
    label: "Payé",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  exempted: {
    label: "Exempté",
    className: "bg-muted text-muted-foreground",
    icon: ShieldOff,
  },
  cancelled: {
    label: "Annulé",
    className: "bg-muted text-muted-foreground",
    icon: Ban,
  },
};

function fmt(cents: number, currency: string | null) {
  return `${(cents / 100).toFixed(2)} ${(currency || "eur").toUpperCase()}`;
}

function FamilyPortalPage() {
  const { t } = useTranslation();
  const listFn = useServerFn(listFamilyPayments);
  const q = useQuery({
    queryKey: ["family-payments"],
    queryFn: () => listFn({ data: {} }),
  });

  const [tab, setTab] = useState<"open" | "paid" | "other" | "all">("open");

  const groups = (q.data?.groups ?? []) as Group[];

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        obligations: g.obligations.filter((o) => {
          if (tab === "all") return true;
          if (tab === "open")
            return o.status === "pending" || o.status === "partially_paid";
          if (tab === "paid") return o.status === "paid";
          return o.status === "exempted" || o.status === "cancelled";
        }),
      }))
      .filter((g) => g.obligations.length > 0);
  }, [groups, tab]);

  const familyTotals = useMemo(() => {
    return groups.reduce(
      (acc, g) => {
        acc.due += g.totals.due_cents;
        acc.paid += g.totals.paid_cents;
        acc.remaining += g.totals.remaining_cents;
        return acc;
      },
      { due: 0, paid: 0, remaining: 0 },
    );
  }, [groups]);

  return (
    <div className="px-5 py-4 space-y-5 max-w-4xl">
      <BackLink to="/home" label={t("common.back")} />

      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Portail famille
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/payments">Vue simple</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/payments/receipts">Reçus</Link>
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Toutes les obligations financières de votre foyer, par joueur.
        </p>
      </header>

      {/* Family-wide summary */}
      <section className="grid grid-cols-3 gap-3">
        <SummaryCard label="Reste à payer" value={fmt(familyTotals.remaining, "eur")} accent />
        <SummaryCard label="Déjà payé" value={fmt(familyTotals.paid, "eur")} />
        <SummaryCard label="Total dû" value={fmt(familyTotals.due, "eur")} muted />
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="w-full">
          <TabsTrigger value="open" className="flex-1">À payer</TabsTrigger>
          <TabsTrigger value="paid" className="flex-1">Payés</TabsTrigger>
          <TabsTrigger value="other" className="flex-1">Autres</TabsTrigger>
          <TabsTrigger value="all" className="flex-1">Tout</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-5 mt-4">
          {q.isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
          {!q.isLoading && filteredGroups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm font-medium">Aucun paiement dans cette catégorie.</p>
            </div>
          )}
          {filteredGroups.map((g) => (
            <PlayerGroup key={g.key} group={g} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        accent
          ? "border-primary/40 bg-primary/5"
          : muted
            ? "border-border bg-muted/40"
            : "border-border bg-card"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-bold mt-0.5">{value}</p>
    </div>
  );
}

function PlayerGroup({ group }: { group: Group }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">{group.label}</h2>
        {group.totals.remaining_cents > 0 && (
          <Badge variant="outline" className="text-[10px]">
            Reste {fmt(group.totals.remaining_cents, "eur")}
          </Badge>
        )}
      </div>
      <Accordion type="multiple" className="space-y-2">
        {group.obligations.map((o) => (
          <ObligationCard key={o.id} obligation={o} />
        ))}
      </Accordion>
    </section>
  );
}

function ObligationCard({ obligation }: { obligation: Obligation }) {
  const checkoutFn = useServerFn(createObligationCheckout);
  const receiptFn = useServerFn(getReceiptDownloadUrl);

  const meta = STATUS_META[obligation.status] ?? STATUS_META.pending;
  const Icon = meta.icon;
  const currency = obligation.currency;
  const remaining = obligation.amount_due_cents - obligation.amount_paid_cents;
  const stripeReady =
    !!obligation.clubs?.stripe_account_id &&
    !!obligation.clubs?.stripe_charges_enabled;
  const canPay =
    (obligation.status === "pending" || obligation.status === "partially_paid") &&
    remaining > 0 &&
    stripeReady;

  const checkout = useMutation({
    mutationFn: () =>
      checkoutFn({ data: { obligationId: obligation.id } }),
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadReceipt = useMutation({
    mutationFn: (receiptId: string) =>
      receiptFn({ data: { receiptId } }),
    onSuccess: ({ url }) => {
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AccordionItem
      value={obligation.id}
      className="rounded-2xl border border-border bg-card px-4"
    >
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex-1 flex flex-wrap items-center gap-3 text-left">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {obligation.items?.title ?? "Paiement"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {obligation.clubs?.name}
              {obligation.items?.due_date
                ? ` · échéance ${obligation.items.due_date}`
                : ""}
            </p>
          </div>
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${meta.className}`}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </span>
          <div className="text-right">
            <p className="text-sm font-bold">
              {fmt(obligation.amount_due_cents, currency)}
            </p>
            {obligation.amount_paid_cents > 0 &&
              obligation.status !== "exempted" && (
                <p className="text-[10px] text-muted-foreground">
                  payé {fmt(obligation.amount_paid_cents, currency)}
                </p>
              )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-1 pb-3 space-y-3">
        {/* Reason for closed states */}
        {obligation.status === "exempted" && obligation.exemption_reason && (
          <p className="text-xs text-muted-foreground italic">
            Exempté — {obligation.exemption_reason}
          </p>
        )}
        {obligation.status === "cancelled" && obligation.cancellation_reason && (
          <p className="text-xs text-muted-foreground italic">
            Annulé — {obligation.cancellation_reason}
          </p>
        )}

        {/* Pay button */}
        {canPay && (
          <Button
            size="sm"
            onClick={() => checkout.mutate()}
            disabled={checkout.isPending}
          >
            {checkout.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Payer {fmt(remaining, currency)}
          </Button>
        )}
        {(obligation.status === "pending" ||
          obligation.status === "partially_paid") &&
          !stripeReady && (
            <p className="text-xs text-muted-foreground">
              Paiement en ligne indisponible — contactez le club.
            </p>
          )}

        {/* Transactions */}
        {obligation.transactions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Paiements ({obligation.transactions.length})
            </p>
            <ul className="space-y-1">
              {obligation.transactions.map((t) => {
                const refunded = t.refunded_amount_cents ?? 0;
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between text-xs rounded border border-border/60 px-2.5 py-1.5"
                  >
                    <span>
                      {new Date(t.paid_at ?? t.created_at).toLocaleDateString(
                        "fr-FR",
                      )}{" "}
                      · {t.method}
                      {refunded > 0 && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                          (remb. {fmt(refunded, t.currency)})
                        </span>
                      )}
                    </span>
                    <span className="font-medium">
                      {fmt(t.amount_gross_cents, t.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Receipts */}
        {obligation.receipts.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Reçus
            </p>
            <ul className="space-y-1">
              {obligation.receipts.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between text-xs rounded border border-border/60 px-2.5 py-1.5"
                >
                  <span className="flex items-center gap-1.5">
                    <ReceiptIcon className="h-3.5 w-3.5" />
                    N° {r.receipt_number} ·{" "}
                    {new Date(r.issued_at).toLocaleDateString("fr-FR")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => downloadReceipt.mutate(r.id)}
                    disabled={downloadReceipt.isPending}
                  >
                    {downloadReceipt.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {obligation.transactions.length === 0 &&
          obligation.receipts.length === 0 &&
          obligation.status === "pending" && (
            <p className="text-xs text-muted-foreground">
              Aucun paiement enregistré pour le moment.
            </p>
          )}
      </AccordionContent>
    </AccordionItem>
  );
}
