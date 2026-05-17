import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listSuperadminLogs } from "@/lib/superadmin.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/superadmin/logs")({
  component: SuperAdminLogs,
});

type Log = {
  id: string;
  actor_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  club_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function SuperAdminLogs() {
  const [items, setItems] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSuperadminLogs({ data: { limit: 100, offset: 0 } })
      .then((r) => setItems(r.items as Log[]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Activity logs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Every sensitive super-admin action is recorded here.
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {!loading && items.length === 0 && (
        <div className="text-sm text-muted-foreground">No activity yet.</div>
      )}
      {!loading && items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((l) => (
            <li key={l.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-xs">{l.action}</div>
                <div className="text-xs text-muted-foreground truncate">
                  actor {l.actor_user_id.slice(0, 8)}
                  {l.target_type && ` · ${l.target_type}`}
                  {l.target_id && ` ${l.target_id.slice(0, 8)}`}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                {new Date(l.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
