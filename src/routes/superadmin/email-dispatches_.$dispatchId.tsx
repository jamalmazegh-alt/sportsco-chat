import { createFileRoute, Link } from "@tanstack/react-router";
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
  switch (status) {
    case "sent":
      return "Envoyé";
    case "delivered":
      return "Délivré";
    case "pending":
      return "En attente";
    case "suppressed":
      return "Supprimé";
    case "failed":
      return "Échec";
    case "dlq":
      return "DLQ";
    case "bounced":
      return "Rejeté";
    case "complained":
      return "Plainte";
    default:
      return status;
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function DispatchDetailPage() {
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
      toast.error(`${label} : ${r.reason ?? "erreur"}`);
      return;
    }
    const parts = [
      `${r.replayed} renfilé(s)`,
      r.skippedAlreadyDelivered > 0 && `${r.skippedAlreadyDelivered} déjà délivré(s)`,
      r.skippedInFlight > 0 && `${r.skippedInFlight} en cours`,
      r.skippedNotRetryable > 0 && `${r.skippedNotRetryable} non-relançable(s)`,
      r.errors > 0 && `${r.errors} erreur(s)`,
    ].filter(Boolean);
    toast.success(`${label} — ${parts.join(" · ")}`);
  }

  async function retryAll() {
    if (!data) return;
    setBusyKey("batch");
    try {
      const r = await retryFn({ data: { dispatchId } });
      summarize(r, "Batch");
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
      summarize(r, "Envoi");
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
        Retour aux envois
      </Link>

      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Mail className="h-3.5 w-3.5" /> Envoi groupé
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
                  {data.event.starts_at && <> · match le {fmtDate(data.event.starts_at)}</>}
                  {" · "}
                </>
              )}
              template <span className="font-mono">{data?.dispatch.template_name}</span>
              {data?.dispatch.created_by_name && <> · par {data.dispatch.created_by_name}</>}
              {data && <> · {fmtDate(data.dispatch.created_at)}</>}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
          {templateSupportsRetry && failuresCount > 0 && (
            <Button
              size="sm"
              onClick={retryAll}
              disabled={busyKey !== null}
              title="Renfiler les envois failed/DLQ sans dupliquer les envois déjà délivrés"
            >
              {busyKey === "batch" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Relancer les échecs ({failuresCount})
            </Button>
          )}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <StatCard label="Destinataires" value={data.counts.total} tone="muted" />
            <StatCard label="Envoyés" value={data.counts.sent} tone="success" />
            <StatCard label="En attente" value={data.counts.pending} tone="info" />
            <StatCard
              label="Échecs"
              value={
                data.counts.failed + data.counts.dlq + data.counts.bounced + data.counts.complained
              }
              tone="danger"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {data.is_settled ? (
              <StatusBadge tone="success">Campagne finalisée</StatusBadge>
            ) : (
              <StatusBadge tone="info">
                <Loader2 className="h-3 w-3 animate-spin" />
                En cours — rafraîchissement auto toutes les 5&nbsp;s
              </StatusBadge>
            )}
            {data.counts.suppressed > 0 && (
              <StatusBadge tone="warn">{data.counts.suppressed} supprimé(s)</StatusBadge>
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
                {s === "all" ? "Tous" : statusLabel(s)}
              </Button>
            ))}
          </div>

          <Input
            placeholder="Filtrer par email ou message d'erreur…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-4 max-w-md"
          />

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Aucun destinataire ne correspond aux filtres.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Destinataire</th>
                    <th className="text-left px-3 py-2 font-medium">Statut</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Tentatives</th>
                    <th className="text-left px-3 py-2 font-medium">Dernier événement</th>
                    <th className="text-left px-3 py-2 font-medium">Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs break-all">{r.recipient_email}</td>
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
                          <span className="text-destructive"> · mismatch {r.mismatch_count}</span>
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
                    </tr>
                  ))}
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
