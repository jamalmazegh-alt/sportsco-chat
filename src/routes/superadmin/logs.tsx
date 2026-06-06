import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listSuperadminLogsEnriched } from "@/lib/superadmin.functions";
import { Loader2, Activity } from "lucide-react";
import { StatusBadge, Avatar, categorize } from "@/lib/superadmin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/superadmin/logs")({
  component: SuperAdminLogs,
});

type Item = Awaited<ReturnType<typeof listSuperadminLogsEnriched>>["items"][number];

const CATEGORIES = ["All", "View", "Impersonation", "Auth", "Account", "Club", "Onboarding", "Billing", "Other"];

function SuperAdminLogs() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    listSuperadminLogsEnriched({ data: { limit: 150 } })
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((l) => {
      const meta = categorize(l.action);
      if (cat !== "All" && meta.category !== cat) return false;
      if (!qq) return true;
      return (
        l.action.toLowerCase().includes(qq) ||
        (l.actor_profile?.full_name ?? "").toLowerCase().includes(qq) ||
        (l.target_user_profile?.full_name ?? "").toLowerCase().includes(qq) ||
        (l.target_club?.name ?? "").toLowerCase().includes(qq)
      );
    });
  }, [items, cat, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    items.forEach((l) => {
      const meta = categorize(l.action);
      c[meta.category] = (c[meta.category] ?? 0) + 1;
    });
    return c;
  }, [items]);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Activity className="h-3.5 w-3.5" /> Activity
        </div>
        <h1 className="text-xl font-semibold mt-1">Activity logs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Every sensitive super-admin action is recorded here with actor, target and severity.
        </p>
      </header>

      <div className="flex gap-2 mb-3 flex-wrap">
        {CATEGORIES.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={cat === c ? "default" : "outline"}
            onClick={() => setCat(c)}
            className="text-xs h-7"
          >
            {c}
            {c !== "All" && counts[c] ? (
              <span className="ml-1.5 text-[10px] opacity-70">{counts[c]}</span>
            ) : null}
          </Button>
        ))}
      </div>

      <Input
        placeholder="Search by action, actor or target…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-md"
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="text-sm text-muted-foreground">No activity matches your filters.</div>
      )}
      {!loading && filtered.length > 0 && (
        <ul className="space-y-1.5">
          {filtered.map((l) => {
            const meta = categorize(l.action);
            const actor = l.actor_profile?.full_name ?? l.actor_user_id.slice(0, 8);
            return (
              <li
                key={l.id}
                className="rounded-md border border-border bg-card px-3 py-2.5 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar url={l.actor_profile?.avatar_url} name={actor} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs">{l.action}</span>
                      <StatusBadge tone={meta.tone}>{meta.category}</StatusBadge>
                      {meta.severity === "high" && <StatusBadge tone="danger">high</StatusBadge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      <span className="font-medium text-foreground/80">{actor}</span>
                      {l.target_user_profile && (
                        <>
                          {" → "}
                          <Link
                            to="/superadmin/users/$userId"
                            params={{ userId: l.target_id as string }}
                            className="hover:underline"
                          >
                            {l.target_user_profile.full_name ?? l.target_id?.slice(0, 8)}
                          </Link>
                        </>
                      )}
                      {l.target_club && (
                        <>
                          {" · "}
                          <Link
                            to="/superadmin/clubs/$clubId"
                            params={{ clubId: l.target_club.id }}
                            className="hover:underline"
                          >
                            {l.target_club.name}
                          </Link>
                        </>
                      )}
                      {!l.target_user_profile && !l.target_club && l.target_type && (
                        <> · {l.target_type} {l.target_id?.slice(0, 8)}</>
                      )}
                    </div>
                    {l.metadata && Object.keys(l.metadata).length > 0 && (
                      <div className="text-[10px] font-mono text-muted-foreground/70 mt-0.5 truncate max-w-md">
                        {JSON.stringify(l.metadata)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString()}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
