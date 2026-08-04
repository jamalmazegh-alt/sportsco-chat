import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getEmailDispatchDetail,
  type DispatchRecipientRow,
} from "@/lib/superadmin/email-dispatches.functions";
import {
  superadminRetryDispatch,
  type SuperadminRetryReport,
} from "@/lib/superadmin/email-retry.functions";
import { StatusBadge } from "@/lib/superadmin/ui";
import { ArrowLeft, Loader2, Mail, RefreshCw, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import i18nInstance from "@/lib/i18n";

export const Route = createFileRoute("/superadmin/email-dispatches_/$dispatchId")({
  component: DispatchDetailPage,
});

type Tone = "success" | "info" | "warn" | "danger" | "muted";

function statusTone(status: string): Tone {
  switch (status) {
    case "sent":
    case "delivered":
      return "success";
    case "pending":
      return "info";
    case "suppressed":
      return "warn";
    case "failed":
    case "dlq":
    case "bounced":
    case "complained":
      return "danger";
    default:
      return "muted";
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    sent: "superadmin.emailDispatches.statusSent",
    delivered: "superadmin.emailDispatches.statusDelivered",
    pending: "superadmin.emailDispatches.statusPending",
    suppressed: "superadmin.emailDispatches.statusSuppressed",
    failed: "superadmin.emailDispatches.statusFailed",
    dlq: "superadmin.emailDispatches.statusDlq",
    bounced: "superadmin.emailDispatches.statusBounced",
    complained: "superadmin.emailDispatches.statusComplained",
  };
  return map[status] ? i18nInstance.t(map[status]) : status;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function DispatchDetailPage() {
  const { t } = useTranslation();
  const { dispatchId } = Route.useParams();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "email-dispatch", dispatchId],
    queryFn: () => getEmailDispatchDetail({ data: { dispatchId } }),
    refetchInterval: (query) => {
      const d = query.state.data;
      // Poll faster while not settled
      return d?.is_settled ? false : 5_000;
    },
  });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const retryFn = useServerFn(superadminRetryDispatch);

  const recipients: DispatchRecipientRow[] = data?.recipients ?? [];
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return recipients.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!qq) return true;
      return (
        r.recipient_email.toLowerCase().includes(qq) ||
        (r.error_message ?? "").toLowerCase().includes(qq)
      );
    });
  }, [recipients, q, statusFilter]);

  const failuresCount = data ? data.counts.failed + data.counts.dlq : 0;
  const templateSupportsRetry = data?.dispatch.template_name === "convocation-invite";

  function summarize(r: SuperadminRetryReport, label: string) {
    if (!r.ok) {
      toast.error(
        t("superadmin.emailDispatches.actionError", {
          label,
          reason: r.reason ?? t("superadmin.emailDispatches.errorFallback"),
        }),
      );
      return;
    }
    const parts = [
      t("superadmin.emailDispatches.replayed", { count: r.replayed }),
      r.skippedAlreadyDelivered > 0 &&
        t("superadmin.emailDispatches.skippedDelivered", { count: r.skippedAlreadyDelivered }),
      r.skippedInFlight > 0 &&
        t("superadmin.emailDispatches.skippedInFlight", { count: r.skippedInFlight }),
      r.skippedNotRetryable > 0 &&
        t("superadmin.emailDispatches.skippedNotRetryable", { count: r.skippedNotRetryable }),
      r.errors > 0 && t("superadmin.emailDispatches.errorsCount", { count: r.errors }),
    ].filter(Boolean);
    toast.success(
      t("superadmin.emailDispatches.actionSuccess", { label, parts: parts.join(" · ") }),
    );
  }

  async function retryAll() {
    if (!data) return;
    setBusyKey("batch");
    try {
      const r = await retryFn({ data: { dispatchId } });
      summarize(r, t("superadmin.emailDispatches.batch"));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function retryOne(rowId: string) {
    setBusyKey(rowId);
    try {
      const r = await retryFn({ data: { dispatchId, logRowIds: [rowId] } });
      summarize(r, t("superadmin.emailDispatches.send"));
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link
        to="/superadmin/email-dispatches"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("superadmin.emailDispatches.backToList")}
      </Link>

      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Mail className="h-3.5 w-3.5" /> {t("superadmin.emailDispatches.detailEyebrow")}
        </div>
        <div className="flex items-start justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {data?.event?.title ?? data?.dispatch.template_name ?? "…"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data?.event && (
                <>
                  {[data.event.club_name, data.event.team_name].filter(Boolean).join(" · ")}
                  {data.event.starts_at && (
                    <>
                      {" "}
                      ·{" "}
                      {t("superadmin.emailDispatches.matchOn", {
                        date: fmtDate(data.event.starts_at),
                      })}
                    </>
                  )}
                  {" · "}
                </>
              )}
              {t("superadmin.emailDispatches.template")}{" "}
              <span className="font-mono">{data?.dispatch.template_name}</span>
              {data?.dispatch.created_by_name && (
                <>
                  {" "}
                  ·{" "}
                  {t("superadmin.emailDispatches.byAuthor", {
                    name: data.dispatch.created_by_name,
                  })}
                </>
              )}
              {data && <> · {fmtDate(data.dispatch.created_at)}</>}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            {t("superadmin.emailDispatches.refresh")}
          </Button>
          {templateSupportsRetry && failuresCount > 0 && (
            <Button
              size="sm"
              onClick={retryAll}
              disabled={busyKey !== null}
              title={t("superadmin.emailDispatches.requeueHint")}
            >
              {busyKey === "batch" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("superadmin.emailDispatches.retryFailures", { count: failuresCount })}
            </Button>
          )}
        </div>
      </header>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("superadmin.emailDispatches.loading")}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <StatCard
              label={t("superadmin.emailDispatches.recipients")}
              value={data.counts.total}
              tone="muted"
            />
            <StatCard
              label={t("superadmin.emailDispatches.sent")}
              value={data.counts.sent}
              tone="success"
            />
            <StatCard
              label={t("superadmin.emailDispatches.pending")}
              value={data.counts.pending}
              tone="info"
            />
            <StatCard
              label={t("superadmin.emailDispatches.failures")}
              value={
                data.counts.failed + data.counts.dlq + data.counts.bounced + data.counts.complained
              }
              tone="danger"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {data.is_settled ? (
              <StatusBadge tone="success">
                {t("superadmin.emailDispatches.campaignFinalized")}
              </StatusBadge>
            ) : (
              <StatusBadge tone="info">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("superadmin.emailDispatches.autoRefreshInProgress")}
              </StatusBadge>
            )}
            {data.counts.suppressed > 0 && (
              <StatusBadge tone="warn">
                {t("superadmin.emailDispatches.suppressedCount", {
                  count: data.counts.suppressed,
                })}
              </StatusBadge>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {(
              [
                "all",
                "sent",
                "pending",
                "failed",
                "dlq",
                "bounced",
                "suppressed",
                "complained",
              ] as const
            ).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? t("superadmin.emailDispatches.filterAll") : statusLabel(s)}
              </Button>
            ))}
          </div>

          <Input
            placeholder={t("superadmin.emailDispatches.filterRecipient")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-4 max-w-md"
          />

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("superadmin.emailDispatches.noRecipientsMatch")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">
                      {t("superadmin.emailDispatches.recipient")}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t("superadmin.emailDispatches.status")}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t("superadmin.emailDispatches.type")}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t("superadmin.emailDispatches.attempts")}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t("superadmin.emailDispatches.lastEvent")}
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      {t("superadmin.emailDispatches.error")}
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      {t("superadmin.emailDispatches.action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const canRetry =
                      templateSupportsRetry &&
                      (r.status === "failed" || r.status === "dlq") &&
                      !!r.message_id;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs break-all">
                          {r.recipient_email}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={statusTone(r.status)}>
                            {statusLabel(r.status)}
                          </StatusBadge>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.notification_type ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.attempt_count}
                          {r.mismatch_count > 0 && (
                            <span className="text-destructive">
                              {" "}
                              ·{" "}
                              {t("superadmin.emailDispatches.mismatch", {
                                count: r.mismatch_count,
                              })}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(r.created_at)}
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-destructive max-w-[24rem] truncate"
                          title={r.error_message ?? undefined}
                        >
                          {r.error_message ?? ""}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canRetry ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => retryOne(r.id)}
                              disabled={busyKey !== null}
                            >
                              {busyKey === r.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCw className="h-3 w-3 mr-1" />
                              )}
                              {t("superadmin.emailDispatches.retry")}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const toneClass: Record<Tone, string> = {
    success: "text-emerald-600 dark:text-emerald-400",
    info: "text-blue-600 dark:text-blue-400",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
    muted: "text-foreground",
  };
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${toneClass[tone]}`}>{value}</div>
    </div>
  );
}
