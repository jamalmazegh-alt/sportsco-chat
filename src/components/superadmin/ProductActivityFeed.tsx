import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Filter, ChevronDown } from "lucide-react";
import {
  listProductActivity,
  type ProductActivityRow,
} from "@/lib/superadmin/product-activity.functions";
import { redactErrorMessage } from "@/lib/observability/redact";
import { StatusBadge } from "@/lib/superadmin/ui";

const CATEGORIES = [
  "team",
  "event",
  "convocation",
  "camp",
  "tournament",
  "invite",
  "social",
  "wall",
  "import",
  "support",
  "impersonation",
] as const;

const STATUSES = ["success", "warning", "failure"] as const;

type Filters = {
  clubId?: string;
  category?: string;
  status?: "success" | "warning" | "failure";
};

export function ProductActivityFeed({ clubId }: { clubId?: string }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({ clubId });
  const [rows, setRows] = useState<ProductActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ ts: string; id: string } | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const r = await listProductActivity({
          data: {
            clubId: filters.clubId ?? null,
            category: filters.category ?? null,
            status: filters.status ?? null,
            cursorTs: reset ? null : (cursor?.ts ?? null),
            cursorId: reset ? null : (cursor?.id ?? null),
            limit: 50,
          },
        });
        const next = r.rows;
        setRows((prev) => (reset ? next : [...prev, ...next]));
        if (next.length < 50) setDone(true);
        else {
          const last = next[next.length - 1];
          setCursor({ ts: last.created_at, id: last.id });
          setDone(false);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [filters, cursor],
  );

  useEffect(() => {
    setCursor(null);
    setRows([]);
    setDone(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.clubId, filters.category, filters.status]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          className="text-xs bg-background border border-border rounded px-2 py-1"
          value={filters.category ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || undefined }))}
        >
          <option value="">{t("superadmin.tickets.allCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="text-xs bg-background border border-border rounded px-2 py-1"
          value={filters.status ?? ""}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: (e.target.value || undefined) as Filters["status"],
            }))
          }
        >
          <option value="">{t("superadmin.tickets.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <div className="p-3 text-xs text-destructive border-b border-destructive/30 bg-destructive/5">
          {error}
        </div>
      )}

      {rows.length === 0 && !loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Aucune activité enregistrée pour ces filtres.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 text-sm flex items-start gap-3">
              <div className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">
                {new Date(r.created_at).toLocaleString()}
              </div>
              <div className="w-20 shrink-0">
                <StatusTone status={r.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{r.action_type}</span>
                  {r.club_name && (
                    <span className="text-xs text-muted-foreground">· {r.club_name}</span>
                  )}
                  {r.actor_full_name && (
                    <span className="text-xs text-muted-foreground">
                      · par {r.actor_full_name}
                      {r.actor_role ? ` (${r.actor_role})` : ""}
                    </span>
                  )}
                </div>
                {r.error_code && (
                  <div className="text-xs text-destructive mt-0.5">code: {r.error_code}</div>
                )}
                {(() => {
                  const meta = r.metadata as { error?: unknown } | null;
                  const err = meta && typeof meta === "object" ? meta.error : undefined;
                  return err ? (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {redactErrorMessage(err)}
                    </div>
                  ) : null;
                })()}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!done && rows.length > 0 && (
        <div className="p-3 border-t border-border">
          <button
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            disabled={loading}
            onClick={() => load(false)}
          >
            Charger plus <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function StatusTone({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "failure") {
    return <StatusBadge tone="danger">{t("superadmin.components.failed")}</StatusBadge>;
  }
  if (status === "warning") {
    return <StatusBadge tone="warn">{t("superadmin.components.statusWarning")}</StatusBadge>;
  }
  return <StatusBadge tone="success">{t("superadmin.components.statusOk")}</StatusBadge>;
}
