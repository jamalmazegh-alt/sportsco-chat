import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listAllClubs } from "@/lib/superadmin.functions";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/superadmin/clubs/")({
  component: SuperAdminClubs,
});

type Club = {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  archived_at: string | null;
  subscription: {
    status: string;
    trial_end: string | null;
    current_period_end: string | null;
  } | null;
};

function statusBadge(sub: Club["subscription"]) {
  if (!sub) return { label: "no sub", tone: "muted" };
  const map: Record<string, { label: string; tone: string }> = {
    trialing: { label: "trial", tone: "info" },
    active: { label: "active", tone: "success" },
    past_due: { label: "past due", tone: "warn" },
    canceled: { label: "canceled", tone: "muted" },
    incomplete: { label: "incomplete", tone: "warn" },
  };
  return map[sub.status] ?? { label: sub.status, tone: "muted" };
}

const TONE: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  muted: "bg-muted text-muted-foreground border-border",
};

function SuperAdminClubs() {
  const [search, setSearch] = useState("");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      listAllClubs({ data: { search: search || undefined, limit: 50, offset: 0 } })
        .then((r) => {
          setClubs(r.items as Club[]);
          setTotal(r.total);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Clubs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} club{total === 1 ? "" : "s"} on the platform
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="pl-9 h-9"
          />
        </div>
      </header>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Club</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Members</th>
              <th className="text-left font-medium px-3 py-2">Subscription</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline animate-spin mr-2" />
                  Loading…
                </td>
              </tr>
            )}
            {!loading && clubs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  No clubs found.
                </td>
              </tr>
            )}
            {!loading &&
              clubs.map((c) => {
                const badge = statusBadge(c.subscription);
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link
                        to="/superadmin/clubs/$clubId"
                        params={{ clubId: c.id }}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.archived_at && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px]">
                          archived
                        </span>
                      )}
                      <div className="text-[10px] font-mono text-muted-foreground/70">
                        {c.id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell tabular-nums">
                      {c.member_count}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${TONE[badge.tone]}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
