import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getClubDetail } from "@/lib/superadmin.functions";
import { Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_superadmin/clubs/$clubId")({
  component: ClubDetail,
});

function ClubDetail() {
  const { clubId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getClubDetail>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getClubDetail({ data: { club_id: clubId } })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [clubId]);

  if (err) return <div className="p-8 text-sm text-destructive">{err}</div>;
  if (!data)
    return (
      <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  const { club, subscription, teams, members } = data;
  if (!club) return <div className="p-8 text-sm">Club not found.</div>;

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link
        to="/superadmin/clubs"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All clubs
      </Link>
      <header className="mb-6">
        <h1 className="text-xl font-semibold">{club.name}</h1>
        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{club.id}</div>
      </header>

      <section className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Subscription
          </div>
          {subscription ? (
            <dl className="text-sm space-y-1">
              <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd>{subscription.status}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>{subscription.plan ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Trial end</dt><dd>{subscription.trial_end ? new Date(subscription.trial_end).toLocaleDateString() : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Period end</dt><dd>{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Cancel at period end</dt><dd>{subscription.cancel_at_period_end ? "yes" : "no"}</dd></div>
            </dl>
          ) : (
            <div className="text-sm text-muted-foreground">No subscription record.</div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Teams</div>
          {teams.length === 0 && <div className="text-sm text-muted-foreground">No teams.</div>}
          <ul className="text-sm space-y-1">
            {teams.map((t) => (
              <li key={t.id} className="flex justify-between">
                <span className={t.deleted_at ? "line-through text-muted-foreground" : ""}>{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.sport ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/30">
          Members ({members.length})
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-left font-medium px-3 py-2">Role</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Phone</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="border-t border-border">
                <td className="px-3 py-2">
                  {(m.profile?.full_name ?? `${m.profile?.first_name ?? ""} ${m.profile?.last_name ?? ""}`.trim()) || "—"}
                  <div className="text-[10px] font-mono text-muted-foreground/70">{m.user_id.slice(0, 8)}</div>
                </td>
                <td className="px-3 py-2 text-xs">{m.role}</td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{m.profile?.phone ?? "—"}</td>
                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
