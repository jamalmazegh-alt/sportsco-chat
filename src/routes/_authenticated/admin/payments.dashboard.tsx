import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { isV2 } from "@/config/features";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useMyRoles } from "@/lib/auth-context";
import { listSeasons } from "@/lib/seasons.functions";
import {
  getPaymentDashboard,
  listClubTransactions,
  exportTransactionsCsv,
  exportItemsRollupCsv,
} from "@/lib/payment-dashboard.functions";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Download, TrendingUp, Wallet, Receipt, Users } from "lucide-react";
import { toast } from "sonner";
import i18nInstance from "@/lib/i18n";
import { downloadFile } from "@/lib/download-file";

export const Route = createFileRoute("/_authenticated/admin/payments/dashboard")({
  // Bêta V1 : dashboard financier visible tant que collectes/cagnottes ou paiements actifs.
  beforeLoad: () => {
    if (!isV2("fundraising_v2")) {
      throw redirect({ to: "/admin", replace: true });
    }
  },
  component: PaymentsDashboardPage,
  head: () => ({
    meta: [
      {
        title:
          (i18nInstance.t("meta.adminPayments.title") as string) +
          " — " +
          (i18nInstance.t("fundraising.dashboardTitle") as string),
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const METHOD_KEYS = ["stripe", "helloasso", "cash", "cheque", "bank_transfer", "manual"] as const;

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  succeeded: "default",
  pending: "secondary",
  failed: "destructive",
  refunded: "outline",
};

function fmtCents(c: number, currency = "eur", locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((c ?? 0) / 100);
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  void downloadFile(blob, filename);
}

function PaymentsDashboardPage() {
  const { t, i18n } = useTranslation();
  const { activeClubId } = useAuth();
  const roles = useMyRoles();
  const [seasonId, setSeasonId] = useState<string | "all">("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const methodLabel = (m: string) =>
    METHOD_KEYS.includes(m as (typeof METHOD_KEYS)[number]) ? t(`payments.method.${m}`) : m;

  const fetchSeasons = useServerFn(listSeasons);
  const fetchDashboard = useServerFn(getPaymentDashboard);
  const fetchTransactions = useServerFn(listClubTransactions);
  const exportTx = useServerFn(exportTransactionsCsv);
  const exportItems = useServerFn(exportItemsRollupCsv);

  const seasonsQ = useQuery({
    queryKey: ["seasons", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => fetchSeasons({ data: { clubId: activeClubId! } }),
  });

  const filters = useMemo(
    () => ({
      clubId: activeClubId!,
      seasonId: seasonId === "all" ? undefined : seasonId,
      from: from || undefined,
      to: to || undefined,
    }),
    [activeClubId, seasonId, from, to],
  );

  const dashQ = useQuery({
    queryKey: ["payments-dashboard", filters],
    enabled: !!activeClubId,
    queryFn: () => fetchDashboard({ data: filters }),
  });

  const txQ = useQuery({
    queryKey: ["payments-tx", filters],
    enabled: !!activeClubId,
    queryFn: () => fetchTransactions({ data: { ...filters, limit: 200 } }),
  });

  if (!roles.includes("admin")) return <Navigate to="/profile" replace />;

  const data = dashQ.data;
  const currency = data?.currency ?? "eur";

  const handleExportTx = async () => {
    try {
      const res = await exportTx({ data: filters });
      downloadCsv(res.csv, res.filename);
      toast.success(t("fundraising.exportDownloaded"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const handleExportItems = async () => {
    try {
      const res = await exportItems({ data: filters });
      downloadCsv(res.csv, res.filename);
      toast.success(t("fundraising.exportDownloaded"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="px-5 py-4 space-y-5">
      <BackLink to="/admin" />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          {t("fundraising.dashboardTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{t("fundraising.dashboardSubtitle")}</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">{t("fundraising.season")}</Label>
            <Select value={seasonId} onValueChange={(v) => setSeasonId(v as string)}>
              <SelectTrigger>
                <SelectValue placeholder={t("fundraising.allSeasons")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("fundraising.allSeasons")}</SelectItem>
                {seasonsQ.data?.seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("events.dateFrom")}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("events.dateTo")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {dashQ.isLoading || !data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<Wallet className="h-5 w-5" />}
              label={t("fundraising.kpiCollected")}
              value={fmtCents(data.kpis.totalCollectedCents, currency)}
              sub={t("fundraising.kpiTxCount", { count: data.kpis.transactionsCount })}
            />
            <KpiCard
              icon={<Receipt className="h-5 w-5" />}
              label={t("fundraising.kpiNet")}
              value={fmtCents(data.kpis.totalNetCents, currency)}
              sub={t("fundraising.kpiFees", {
                amount: fmtCents(data.kpis.totalFeesCents, currency),
              })}
            />
            <KpiCard
              icon={<Users className="h-5 w-5" />}
              label={t("fundraising.kpiDue")}
              value={fmtCents(data.kpis.totalDueCents, currency)}
              sub={t("fundraising.kpiObligations", { count: data.kpis.obligationsCount })}
            />
            <KpiCard
              icon={<TrendingUp className="h-5 w-5" />}
              label={t("fundraising.kpiRate")}
              value={`${(data.kpis.rate * 100).toFixed(1)} %`}
              sub={
                data.kpis.totalDueCents > 0
                  ? t("fundraising.kpiRemaining", {
                      amount: fmtCents(
                        Math.max(0, data.kpis.totalDueCents - data.kpis.totalCollectedCents),
                        currency,
                      ),
                    })
                  : "—"
              }
            />
          </div>

          {/* Export buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportTx}>
              <Download className="h-4 w-4 mr-2" /> {t("fundraising.exportTransactions")}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportItems}>
              <Download className="h-4 w-4 mr-2" /> {t("fundraising.exportItems")}
            </Button>
          </div>

          <Tabs defaultValue="items" className="w-full">
            <TabsList>
              <TabsTrigger value="items">{t("fundraising.byItem")}</TabsTrigger>
              <TabsTrigger value="methods">{t("fundraising.byMethod")}</TabsTrigger>
              <TabsTrigger value="monthly">{t("fundraising.byMonth")}</TabsTrigger>
              <TabsTrigger value="tx">{t("fundraising.tabTransactions")}</TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="space-y-2 mt-4">
              {data.itemRollup.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("fundraising.emptyDashboard")}</p>
              ) : (
                data.itemRollup.map((it) => (
                  <Card key={it.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{it.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("fundraising.itemRollupLine", {
                              total: it.total_count,
                              paid: it.paid_count,
                              partial: it.partial_count,
                              pending: it.pending_count,
                            })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">
                            {fmtCents(it.collected_cents, it.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            / {fmtCents(it.due_cents, it.currency)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${
                              it.due_cents > 0
                                ? Math.min(100, (it.collected_cents / it.due_cents) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="methods" className="space-y-2 mt-4">
              {Object.entries(data.byMethod).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("fundraising.emptyMethods")}</p>
              ) : (
                Object.entries(data.byMethod).map(([m, v]) => (
                  <Card key={m}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{methodLabel(m)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("fundraising.kpiTxCount", { count: v.count })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{fmtCents(v.gross, currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("fundraising.netLabel", { amount: fmtCents(v.net, currency) })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="monthly" className="mt-4">
              {data.monthly.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("fundraising.emptyMonthly")}</p>
              ) : (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    {(() => {
                      const max = Math.max(...data.monthly.map((m) => m.gross));
                      return data.monthly.map((m) => (
                        <div key={m.month}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-muted-foreground">{m.month}</span>
                            <span className="font-medium">{fmtCents(m.gross, currency)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${max > 0 ? (m.gross / max) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="tx" className="mt-4">
              {txQ.isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (txQ.data?.transactions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("fundraising.noTransactions")}</p>
              ) : (
                <div className="space-y-2">
                  {txQ.data!.transactions.map((tx) => (
                    <Card key={tx.id}>
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate">{tx.item_title}</p>
                            <Badge
                              variant={STATUS_VARIANTS[tx.status] ?? "secondary"}
                              className="text-[10px]"
                            >
                              {tx.status}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {methodLabel(tx.method)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {tx.player_name ? `${tx.player_name} • ` : ""}
                            {tx.payer_name ?? "—"} •{" "}
                            {new Date(tx.created_at).toLocaleDateString(i18n.language)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">
                            {fmtCents(tx.amount_gross_cents, tx.currency, i18n.language)}
                          </p>
                          {tx.provider_fee_cents > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              -{fmtCents(tx.provider_fee_cents, tx.currency, i18n.language)} frais
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5 font-normal">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-bold">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
