import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Share2, UploadCloud } from "lucide-react";
import {
  listSocialFailures,
  listFailedImports,
  type SocialFailureRow,
  type FailedImportRow,
} from "@/lib/superadmin/product-activity.functions";
import { redactErrorMessage } from "@/lib/observability/redact";

export function WatchlistPanel() {
  const [social, setSocial] = useState<SocialFailureRow[] | null>(null);
  const [imports, setImports] = useState<FailedImportRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listSocialFailures()
      .then((r) => setSocial(r.rows))
      .catch((e) => setErr(e instanceof Error ? e.message : "load error"));
    listFailedImports()
      .then((r) => setImports(r.rows))
      .catch((e) => setErr(e instanceof Error ? e.message : "load error"));
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <WatchCard
        icon={<Share2 className="h-4 w-4" />}
        title="Synchros réseaux sociaux en échec"
        emptyLabel="Toutes les connexions sociales sont OK."
        loading={social === null}
        count={social?.length ?? 0}
      >
        {social?.map((s) => (
          <div key={s.connection_id} className="p-2 border-t border-border text-xs">
            <div className="font-medium">
              {s.club_name ?? "—"} · {s.network}
              {s.account_name ? ` · ${s.account_name}` : ""}
            </div>
            <div className="text-muted-foreground truncate mt-0.5">
              {redactErrorMessage(s.last_sync_error)}
            </div>
            {s.last_synced_at && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                dernière tentative {new Date(s.last_synced_at).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </WatchCard>

      <WatchCard
        icon={<UploadCloud className="h-4 w-4" />}
        title="Imports échoués ou partiels"
        emptyLabel="Aucun import en échec."
        loading={imports === null}
        count={imports?.length ?? 0}
      >
        {imports?.map((i) => (
          <div key={i.id} className="p-2 border-t border-border text-xs">
            <div className="font-medium">
              {i.club_name ?? "—"} · {i.import_type}
              {i.file_name ? ` · ${i.file_name}` : ""}
            </div>
            <div className="text-muted-foreground mt-0.5">
              {i.status} — {i.rows_imported}/{i.rows_total} lignes ·{" "}
              {new Date(i.created_at).toLocaleString()}
            </div>
            {i.error_log != null && (
              <div className="text-muted-foreground truncate mt-0.5">
                {redactErrorMessage(i.error_log)}
              </div>
            )}
          </div>
        ))}
      </WatchCard>

      {err && (
        <div className="md:col-span-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {err}
        </div>
      )}
    </div>
  );
}

function WatchCard({
  icon,
  title,
  loading,
  count,
  emptyLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  loading: boolean;
  count: number;
  emptyLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        {icon}
        <div className="text-sm font-medium flex-1">{title}</div>
        {count > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-[11px] px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" /> {count}
          </span>
        )}
      </div>
      {loading ? (
        <div className="p-4 text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
        </div>
      ) : count === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="max-h-72 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}
