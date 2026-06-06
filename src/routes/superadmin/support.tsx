import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  searchUsers,
  getUserSupportSummary,
  getClubSupportSummary,
  listAllClubs,
  getSupportAlerts,
} from "@/lib/superadmin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Search,
  User,
  Building2,
  LifeBuoy,
  AlertTriangle,
  Clock,
  MailX,
  CreditCard,
} from "lucide-react";
import { StatusBadge, trialCountdown } from "@/lib/superadmin/ui";

export const Route = createFileRoute("/superadmin/support")({
  component: SupportPage,
});

type UserSummary = Awaited<ReturnType<typeof getUserSupportSummary>>;
type ClubSummary = Awaited<ReturnType<typeof getClubSupportSummary>>;
type Alerts = Awaited<ReturnType<typeof getSupportAlerts>>;
type UserHit = { id: string; full_name: string | null; phone: string | null };
type ClubHit = { id: string; name: string };

function SupportPage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"user" | "club">("user");
  const [busy, setBusy] = useState(false);
  const [userHits, setUserHits] = useState<UserHit[] | null>(null);
  const [clubHits, setClubHits] = useState<ClubHit[] | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [clubSummary, setClubSummary] = useState<ClubSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);

  useEffect(() => {
    getSupportAlerts()
      .then(setAlerts)
      .catch(() => setAlerts(null))
      .finally(() => setAlertsLoading(false));
  }, []);

  const runSearch = async () => {
    setErr(null);
    setUserSummary(null);
    setClubSummary(null);
    setBusy(true);
    try {
      if (mode === "user") {
        const r = await searchUsers({ data: { search: q || undefined, limit: 20 } });
        setUserHits(r.items as UserHit[]);
        setClubHits(null);
      } else {
        const r = await listAllClubs({ data: { search: q || undefined, limit: 20, offset: 0 } });
        setClubHits(r.items.map((c) => ({ id: c.id, name: c.name })));
        setUserHits(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const loadUser = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await getUserSupportSummary({ data: { user_id: id } });
      setUserSummary(r);
      setClubSummary(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const loadClub = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await getClubSupportSummary({ data: { club_id: id } });
      setClubSummary(r);
      setUserSummary(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const totalAlerts = alerts
    ? alerts.trials_ending.length +
      alerts.past_due.length +
      alerts.stale_invites.length +
      alerts.email_failures.length
    : 0;

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <LifeBuoy className="h-3.5 w-3.5" /> Support
        </div>
        <h1 className="text-xl font-semibold mt-1">Support hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live operational alerts and direct lookup. Every lookup is audited.
        </p>
      </header>

      {/* ALERTS */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Live alerts
            {totalAlerts > 0 && (
              <StatusBadge tone="warn">{totalAlerts}</StatusBadge>
            )}
          </h2>
          {alertsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <AlertCard
            tone="warn"
            icon={<Clock className="h-4 w-4" />}
            title="Trials ending in 7 days"
            count={alerts?.trials_ending.length ?? 0}
            empty="All trials are safe."
          >
            {alerts?.trials_ending.map((s) => {
              const t = trialCountdown(s.trial_end);
              return (
                <li key={s.club_id} className="flex justify-between items-center text-sm">
                  <Link
                    to="/superadmin/clubs/$clubId"
                    params={{ clubId: s.club_id }}
                    className="hover:underline truncate"
                  >
                    {s.club_name}
                  </Link>
                  <StatusBadge tone="warn">{t ?? "—"}</StatusBadge>
                </li>
              );
            })}
          </AlertCard>

          <AlertCard
            tone="danger"
            icon={<CreditCard className="h-4 w-4" />}
            title="Past-due / incomplete billing"
            count={alerts?.past_due.length ?? 0}
            empty="No payment issues."
          >
            {alerts?.past_due.map((s) => (
              <li key={s.club_id} className="flex justify-between items-center text-sm">
                <Link
                  to="/superadmin/clubs/$clubId"
                  params={{ clubId: s.club_id }}
                  className="hover:underline truncate"
                >
                  {s.club_name}
                </Link>
                <StatusBadge tone="danger">{s.status}</StatusBadge>
              </li>
            ))}
          </AlertCard>

          <AlertCard
            tone="info"
            icon={<User className="h-4 w-4" />}
            title="Stale invites (>30 days)"
            count={alerts?.stale_invites.length ?? 0}
            empty="No stale invites."
          >
            {alerts?.stale_invites.slice(0, 8).map((i) => (
              <li key={i.id} className="flex justify-between items-center text-sm gap-3">
                <span className="truncate min-w-0">
                  <span className="font-medium">{i.email ?? "—"}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">· {i.club_name}</span>
                </span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(i.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </AlertCard>

          <AlertCard
            tone="danger"
            icon={<MailX className="h-4 w-4" />}
            title="Recent email failures"
            count={alerts?.email_failures.length ?? 0}
            empty="All emails delivered."
          >
            {alerts?.email_failures.slice(0, 8).map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex justify-between items-center gap-2">
                  <span className="truncate font-medium">{e.recipient_email}</span>
                  <StatusBadge tone="danger">{e.status}</StatusBadge>
                </div>
                {e.error_message && (
                  <div className="text-[11px] text-muted-foreground truncate">{e.error_message}</div>
                )}
              </li>
            ))}
          </AlertCard>
        </div>
      </section>

      {/* LOOKUP */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Direct lookup</h2>

        <div className="flex gap-2 mb-3">
          <Button
            size="sm"
            variant={mode === "user" ? "default" : "outline"}
            onClick={() => setMode("user")}
          >
            <User className="h-4 w-4 mr-1.5" /> User
          </Button>
          <Button
            size="sm"
            variant={mode === "club" ? "default" : "outline"}
            onClick={() => setMode("club")}
          >
            <Building2 className="h-4 w-4 mr-1.5" /> Club
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
          className="flex gap-2 mb-5"
        >
          <Input
            placeholder={mode === "user" ? "Search by name or phone…" : "Search clubs by name…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive mb-4">
            {err}
          </div>
        )}

        {userHits && (
          <ul className="rounded-lg border border-border divide-y divide-border bg-card mb-6">
            {userHits.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No matches.</li>
            )}
            {userHits.map((u) => (
              <li key={u.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.phone ?? u.id}</div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => loadUser(u.id)}>Summary</Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/superadmin/users/$userId" params={{ userId: u.id }}>Manage</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {clubHits && (
          <ul className="rounded-lg border border-border divide-y divide-border bg-card mb-6">
            {clubHits.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No matches.</li>
            )}
            {clubHits.map((c) => (
              <li key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => loadClub(c.id)}>Summary</Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/superadmin/clubs/$clubId" params={{ clubId: c.id }}>Manage</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {userSummary && (
          <section className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">User</div>
              <div className="text-sm font-medium">{userSummary.profile?.full_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {userSummary.profile?.phone ?? "—"} · {userSummary.profile?.preferred_language ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Clubs ({userSummary.clubs.length})
              </div>
              <ul className="space-y-1 text-sm">
                {userSummary.clubs.map((m) => (
                  <li key={m.club_id} className="flex justify-between">
                    <Link
                      to="/superadmin/clubs/$clubId"
                      params={{ clubId: m.club_id }}
                      className="hover:underline"
                    >
                      {m.club?.name ?? m.club_id}
                      {m.club?.archived_at && (
                        <span className="ml-2 text-xs text-muted-foreground">(archived)</span>
                      )}
                    </Link>
                    <span className="text-xs text-muted-foreground uppercase">{m.role}</span>
                  </li>
                ))}
                {userSummary.clubs.length === 0 && (
                  <li className="text-muted-foreground">No club memberships.</li>
                )}
              </ul>
            </div>
            {userSummary.profile && (
              <div className="pt-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/superadmin/users/$userId" params={{ userId: userSummary.profile.id }}>
                    Open full user page →
                  </Link>
                </Button>
              </div>
            )}
          </section>
        )}

        {clubSummary && (
          <section className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Club</div>
              <div className="text-sm font-medium">{clubSummary.club?.name}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Admins</div>
              <ul className="space-y-1 text-sm">
                {clubSummary.admins.map((a) => (
                  <li key={a.user_id} className="flex justify-between">
                    <Link
                      to="/superadmin/users/$userId"
                      params={{ userId: a.user_id }}
                      className="hover:underline"
                    >
                      {a.profile?.full_name ?? a.user_id}
                    </Link>
                    <span className="text-xs text-muted-foreground">{a.profile?.phone ?? "—"}</span>
                  </li>
                ))}
                {clubSummary.admins.length === 0 && (
                  <li className="text-muted-foreground">No admins.</li>
                )}
              </ul>
            </div>
            {clubSummary.club && (
              <div className="pt-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/superadmin/clubs/$clubId" params={{ clubId: clubSummary.club.id }}>
                    Open full club page →
                  </Link>
                </Button>
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
}

function AlertCard({
  tone,
  icon,
  title,
  count,
  empty,
  children,
}: {
  tone: "warn" | "danger" | "info";
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon} {title}
        </div>
        <StatusBadge tone={count === 0 ? "success" : tone}>{count}</StatusBadge>
      </div>
      {count === 0 ? (
        <div className="text-xs text-muted-foreground">{empty}</div>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </div>
  );
}
