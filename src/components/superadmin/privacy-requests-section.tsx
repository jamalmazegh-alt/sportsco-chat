import { useEffect, useState } from "react";
import {
  listPrivacyRequests,
  approveDeletion,
  rejectDeletion,
  retryExport,
} from "@/lib/privacy-admin.functions";
import { Loader2, ShieldAlert, Download, UserX, RefreshCw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Data = Awaited<ReturnType<typeof listPrivacyRequests>>;

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_TONE[status] ?? "bg-gray-100"}`}>
      {status}
    </span>
  );
}

export function PrivacyRequestsSection() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => listPrivacyRequests().then(setData).catch((e) => toast.error(e.message));
  useEffect(() => { reload(); }, []);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading privacy requests…
      </div>
    );
  }

  const pendingExports = data.exports.filter((r) => r.status === "pending" || r.status === "failed");
  const pendingDeletions = data.deletions.filter((r) => r.status === "pending" || r.status === "failed");

  const doRetry = async (id: string) => {
    setBusy(id);
    try { await retryExport({ data: { id } }); toast.success("Export relancé"); reload(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const doApprove = async (id: string, hardDelete: boolean) => {
    if (!confirm(hardDelete ? "Suppression DURE confirmée ? Action irréversible." : "Anonymiser ce compte ?")) return;
    setBusy(id);
    try { await approveDeletion({ data: { id, hardDelete } }); toast.success("Demande traitée"); reload(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const doReject = async (id: string) => {
    if (!confirm("Rejeter cette demande de suppression ?")) return;
    setBusy(id);
    try { await rejectDeletion({ data: { id } }); toast.success("Rejetée"); reload(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Privacy / RGPD ({pendingExports.length + pendingDeletions.length} en attente)
        </h2>
        <button onClick={reload} className="text-xs text-primary hover:underline flex items-center gap-1">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Exports */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <Download className="h-3 w-3" /> Exports ({data.exports.length})
        </h3>
        {data.exports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune demande.</p>
        ) : (
          <div className="space-y-1">
            {data.exports.slice(0, 10).map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-border last:border-0">
                <StatusPill status={r.status} />
                <span className="flex-1 min-w-0 truncate">
                  {r._user?.email ?? r.user_id} <span className="text-muted-foreground">· {new Date(r.requested_at).toLocaleString()}</span>
                </span>
                {r.error && <span className="text-xs text-red-600 truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                {r.file_url && r.status === "completed" && (
                  <a href={r.file_url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline">Lien</a>
                )}
                {(r.status === "pending" || r.status === "failed") && (
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => doRetry(r.id)}>
                    {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Traiter"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deletions */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <UserX className="h-3 w-3" /> Account deletions ({data.deletions.length})
        </h3>
        {data.deletions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune demande.</p>
        ) : (
          <div className="space-y-1">
            {data.deletions.slice(0, 15).map((r: any) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm py-1.5 border-b border-border last:border-0">
                <StatusPill status={r.status} />
                {r.hard_delete && <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800">HARD</span>}
                <span className="flex-1 min-w-[180px] truncate">
                  {r._user?.email ?? r.user_id}
                  <span className="text-muted-foreground"> · {new Date(r.requested_at).toLocaleString()}</span>
                  {r.scheduled_for && (
                    <span className="text-muted-foreground"> · échéance {new Date(r.scheduled_for).toLocaleDateString()}</span>
                  )}
                </span>
                {r.error && <span className="text-xs text-red-600 truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                {r.status === "pending" && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => doApprove(r.id, false)}>
                      <Check className="h-3 w-3 mr-1" /> Anonymiser
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => doApprove(r.id, true)}>
                      <UserX className="h-3 w-3 mr-1" /> Suppr. dure
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => doReject(r.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                )}
                {r.status === "failed" && (
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => doApprove(r.id, r.hard_delete)}>
                    Réessayer
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
