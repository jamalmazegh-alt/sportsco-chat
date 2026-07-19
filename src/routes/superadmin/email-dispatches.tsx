import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listEmailDispatches,
  type EmailDispatchSummary,
} from "@/lib/superadmin/email-dispatches.functions";
import {
  backfillConvocationEmails,
  type BackfillEventResult,
} from "@/lib/superadmin/backfill-convocations.functions";
import { StatusBadge } from "@/lib/superadmin/ui";
import { Loader2, Mail, ChevronRight, RefreshCw, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/superadmin/email-dispatches")({
  component: EmailDispatchesPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function EmailDispatchesPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "email-dispatches"],
    queryFn: () => listEmailDispatches({ data: { limit: 100 } }),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "settled" | "in_progress" | "has_failures"
  >("all");

  const rows: EmailDispatchSummary[] = data?.rows ?? [];
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "settled" && !r.is_settled) return false;
      if (statusFilter === "in_progress" && r.is_settled) return false;
      if (
        statusFilter === "has_failures" &&
        r.counts.failed + r.counts.dlq + r.counts.bounced + r.counts.complained === 0
      )
        return false;
      if (!qq) return true;
      return (
        r.template_name.toLowerCase().includes(qq) ||
        (r.event_title ?? "").toLowerCase().includes(qq) ||
        (r.club_name ?? "").toLowerCase().includes(qq) ||
        (r.team_name ?? "").toLowerCase().includes(qq) ||
        (r.created_by_name ?? "").toLowerCase().includes(qq)
      );
    });
  }, [rows, q, statusFilter]);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Mail className="h-3.5 w-3.5" /> Emails
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <div>
            <h1 className="text-xl font-semibold">Envois groupés</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Chaque campagne (convocation, invitation…) avec le statut agrégé jusqu'à son état
              final. Se rafraîchit toutes les 20&nbsp;s.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Rafraîchir
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 mb-3">
        {(
          [
            ["all", "Tous"],
            ["in_progress", "En cours"],
            ["settled", "Finalisés"],
            ["has_failures", "Avec échecs"],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={statusFilter === k ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setStatusFilter(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      <Input
        placeholder="Filtrer par template, événement, club, équipe, auteur…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-md"
      />

      <BackfillPanel onDone={() => refetch()} />

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}
      {!isLoading && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground">Aucun envoi ne correspond aux filtres.</div>
      )}
      {!isLoading && filtered.length > 0 && (
        <ul className="space-y-1.5">
          {filtered.map((d) => {
            const failures =
              d.counts.failed + d.counts.dlq + d.counts.bounced + d.counts.complained;
            return (
              <li key={d.id}>
                <Link
                  to="/superadmin/email-dispatches/$dispatchId"
                  params={{ dispatchId: d.id }}
                  className="block rounded-md border border-border bg-card px-3 py-2.5 hover:bg-foreground/[0.03] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate max-w-[24rem]">
                          {d.event_title ?? d.template_name}
                        </span>
                        <StatusBadge tone={d.dispatch_type === "manual_resend" ? "warn" : "info"}>
                          {d.dispatch_type === "manual_resend"
                            ? "Renvoi"
                            : d.dispatch_type === "dlq_replay"
                              ? "Replay DLQ"
                              : "Initial"}
                        </StatusBadge>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {d.template_name}
                        </span>
                        {d.is_settled ? (
                          <StatusBadge tone="success">Finalisé</StatusBadge>
                        ) : d.counts.total === 0 ? (
                          <StatusBadge tone="muted">Aucun log</StatusBadge>
                        ) : (
                          <StatusBadge tone="info">En cours</StatusBadge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {[d.club_name, d.team_name].filter(Boolean).join(" · ")}
                        {d.created_by_name && <> · par {d.created_by_name}</>}
                        {" · "}
                        {fmtDate(d.created_at)}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StatusBadge tone="muted">{d.counts.total} destinataires</StatusBadge>
                        {d.counts.sent > 0 && (
                          <StatusBadge tone="success">✓ {d.counts.sent}</StatusBadge>
                        )}
                        {d.counts.pending > 0 && (
                          <StatusBadge tone="info">⏳ {d.counts.pending}</StatusBadge>
                        )}
                        {d.counts.suppressed > 0 && (
                          <StatusBadge tone="warn">supp. {d.counts.suppressed}</StatusBadge>
                        )}
                        {failures > 0 && <StatusBadge tone="danger">échec {failures}</StatusBadge>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
