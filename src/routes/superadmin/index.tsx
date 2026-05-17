import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPlatformStats } from "@/lib/superadmin.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/superadmin/")({
  component: SuperAdminDashboard,
});

type Stats = Record<string, number | string>;

const TILES: Array<{ key: string; label: string; hint?: string }> = [
  { key: "clubs_total", label: "Clubs" },
  { key: "clubs_active", label: "Active clubs", hint: "With active subscription" },
  { key: "users_total", label: "Users" },
  { key: "subs_active", label: "Active subs" },
  { key: "subs_trialing", label: "Trials" },
  { key: "subs_expiring_7d", label: "Expiring < 7 days" },
  { key: "events_30d", label: "Events (30d)" },
  { key: "convocations_30d", label: "Call-ups sent (30d)" },
];

function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getPlatformStats()
      .then((r) => setStats(r.stats))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Platform overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Snapshot of the Clubero platform — refreshed on load.
        </p>
      </header>

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {!stats && !err && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TILES.map((t) => (
            <div
              key={t.key}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.label}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {String(stats[t.key] ?? "—")}
              </div>
              {t.hint && (
                <div className="text-xs text-muted-foreground mt-1">{t.hint}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {stats?.generated_at && (
        <div className="mt-6 text-xs text-muted-foreground">
          Generated at {new Date(String(stats.generated_at)).toLocaleString()}
        </div>
      )}
    </div>
  );
}
