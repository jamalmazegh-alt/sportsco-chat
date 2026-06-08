import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  listMyReceipts,
  getReceiptDownloadUrl,
} from "@/lib/payment-receipts.functions";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Receipt } from "lucide-react";
import { toast } from "sonner";
import i18nInstance from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/payments/receipts")({
  component: MyReceiptsPage,
  head: () => ({
    meta: [
      {
        title: i18nInstance.t("meta.payments.receipts"),
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Receipt = {
  id: string;
  receipt_number: number;
  item_title: string | null;
  player_name: string | null;
  amount_gross_cents: number;
  currency: string;
  method: string;
  issued_at: string;
};

function formatAmount(cents: number, currency: string | null | undefined, locale: string) {
  const code = (currency || "eur").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

function MyReceiptsPage() {
  const { t, i18n } = useTranslation();
  const listFn = useServerFn(listMyReceipts);
  const dlFn = useServerFn(getReceiptDownloadUrl);

  const q = useQuery({
    queryKey: ["my-receipts"],
    queryFn: () => listFn({ data: {} }),
  });

  async function download(id: string) {
    try {
      const { url } = await dlFn({ data: { receiptId: id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }

  const receipts = (q.data?.receipts ?? []) as Receipt[];

  return (
    <div className="px-5 py-4 space-y-5 max-w-3xl">
      <BackLink to="/payments" label={t("common.back")} />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Receipt className="h-6 w-6 text-primary" />
          {t("payments.receipts")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("payments.receiptsSubtitle")}
        </p>
      </header>

      {q.isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {q.data && receipts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">{t("payments.noReceipts")}</p>
          <p className="text-xs text-muted-foreground mt-1">
            <Link to="/payments" className="underline">
              {t("payments.viewPending")}
            </Link>
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {receipts.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center gap-3 justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">
                {r.item_title ?? t("payments.defaultItem")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("payments.receiptNumber", {
                  number: String(r.receipt_number).padStart(6, "0"),
                })}{" "}
                · {new Date(r.issued_at).toLocaleDateString(i18n.language)}
                {r.player_name ? ` · ${r.player_name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">
                {formatAmount(r.amount_gross_cents, r.currency, i18n.language)}
              </span>
              <Button size="sm" variant="outline" onClick={() => download(r.id)}>
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
