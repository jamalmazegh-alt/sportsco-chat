import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInviteBatches, getInviteBatchRows } from "@/lib/superadmin/observability.functions";
import { StatusBadge } from "@/lib/superadmin/ui";
import { Loader2, Send, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/superadmin/invite-batches")({
  component: InviteBatchesPage,
});

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function InviteBatchesPage() {
  const { t } = useTranslation();
  const [template, setTemplate] = useState<string>("");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "invite-batches", template],
    queryFn: () => listInviteBatches({ data: { template: template || null, limit: 200 } }),
    staleTime: 15_000,
  });
  const rows = data?.rows ?? [];

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Send className="h-3.5 w-3.5" /> {t("superadmin.inviteBatches.eyebrow")}
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <div>
            <h1 className="text-xl font-semibold">{t("superadmin.inviteBatches.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("superadmin.inviteBatches.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("superadmin.inviteBatches.filterPlaceholder")}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="h-8 w-64"
            />
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
          {t("superadmin.inviteBatches.empty")}
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <BatchRow key={r.batch_id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchRow({
  row,
}: {
  row: NonNullable<Awaited<ReturnType<typeof listInviteBatches>>["rows"]>[number];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "invite-batch-rows", row.batch_id],
    queryFn: () => getInviteBatchRows({ data: { batchId: row.batch_id } }),
    enabled: open,
    retry: 1,
  });
  return (
    <div className="bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {row.template_name}
            {row.club_name ? (
              <span className="text-muted-foreground"> · {row.club_name}</span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">{fmt(row.bucket_start)}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone="muted">
            {t("superadmin.inviteBatches.total", { count: row.total })}
          </StatusBadge>
          {row.sent > 0 && (
            <StatusBadge tone="success">
              {t("superadmin.inviteBatches.sent", { count: row.sent })}
            </StatusBadge>
          )}
          {row.pending > 0 && (
            <StatusBadge tone="info">
              {t("superadmin.inviteBatches.pending", { count: row.pending })}
            </StatusBadge>
          )}
          {row.failed > 0 && (
            <StatusBadge tone="danger">
              {t("superadmin.inviteBatches.failed", { count: row.failed })}
            </StatusBadge>
          )}
          {row.suppressed > 0 && (
            <StatusBadge tone="warn">
              {t("superadmin.inviteBatches.blocked", { count: row.suppressed })}
            </StatusBadge>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-border bg-muted/30">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="px-6 py-4 space-y-2">
              <p className="text-sm text-destructive">
                {t("superadmin.inviteBatches.loadError", {
                  message:
                    error instanceof Error
                      ? error.message
                      : t("superadmin.inviteBatches.unknownFailure"),
                })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
                {t("superadmin.inviteBatches.retry")}
              </Button>
            </div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="px-6 py-4 text-xs text-muted-foreground">
              {t("superadmin.inviteBatches.noRows")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.rows ?? []).map((r) => (
                <div key={r.id} className="px-6 py-2.5 text-sm space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 truncate">{r.recipient_email}</div>
                    <div className="text-xs text-muted-foreground">{fmt(r.created_at)}</div>
                    <StatusBadge
                      tone={
                        r.status === "sent" || r.status === "delivered"
                          ? "success"
                          : r.status === "pending" || r.status === "processing"
                            ? "info"
                            : r.status === "suppressed"
                              ? "warn"
                              : "danger"
                      }
                    >
                      {r.status}
                    </StatusBadge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                    {r.message_id ? (
                      <span>
                        msg&nbsp;
                        <span className="font-mono">{r.message_id.slice(0, 12)}…</span>
                      </span>
                    ) : null}
                    <span>
                      {t("superadmin.inviteBatches.attempts", { count: r.attempt_count })}
                    </span>
                    {r.dispatch_id && (
                      <span>
                        dispatch&nbsp;
                        <span className="font-mono">{r.dispatch_id.slice(0, 8)}</span>
                      </span>
                    )}
                    {r.error_message && (
                      <span className="text-destructive" title={r.error_message}>
                        {r.error_message}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
