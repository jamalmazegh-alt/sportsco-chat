import { createFileRoute, Link } from "@tanstack/react-router";
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
  const [template, setTemplate] = useState<string>("");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "invite-batches", template],
    queryFn: () =>
      listInviteBatches({ data: { template: template || null, limit: 200 } }),
    staleTime: 15_000,
  });
  const rows = data?.rows ?? [];

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Send className="h-3.5 w-3.5" /> Invitations
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <div>
            <h1 className="text-xl font-semibold">Batches d'invitations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Regroupés par club + template + fenêtre de 2&nbsp;min.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filtre template (ex: player-invite)"
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
          Aucun batch trouvé.
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

function BatchRow({ row }: { row: NonNullable<Awaited<ReturnType<typeof listInviteBatches>>["rows"]>[number] }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "invite-batch-rows", row.batch_id],
    queryFn: () => getInviteBatchRows({ data: { batchId: row.batch_id } }),
    enabled: open,
  });
  return (
    <div className="bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {row.template_name}
            {row.club_name ? <span className="text-muted-foreground"> · {row.club_name}</span> : null}
          </div>
          <div className="text-xs text-muted-foreground">{fmt(row.bucket_start)}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone="muted">{row.total} total</StatusBadge>
          {row.sent > 0 && <StatusBadge tone="success">{row.sent} envoyés</StatusBadge>}
          {row.pending > 0 && <StatusBadge tone="info">{row.pending} en cours</StatusBadge>}
          {row.failed > 0 && <StatusBadge tone="danger">{row.failed} échec</StatusBadge>}
          {row.suppressed > 0 && <StatusBadge tone="warn">{row.suppressed} bloqué</StatusBadge>}
        </div>
      </button>
      {open && (
        <div className="border-t border-border bg-muted/30">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(data?.rows ?? []).map((r) => (
                <div key={r.id} className="px-6 py-2 flex items-center gap-3 text-sm">
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
                  {r.error_message && (
                    <span className="text-xs text-destructive truncate max-w-[240px]" title={r.error_message}>
                      {r.error_message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
