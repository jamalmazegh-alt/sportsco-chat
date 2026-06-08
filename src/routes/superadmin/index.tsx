import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPlatformStats, getFinanceOverview } from "@/lib/superadmin.functions";
import { getSupportStats } from "@/lib/support.functions";
import {
  Loader2,
  TrendingUp,
  Users,
  Building2,
  Banknote,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CircleDollarSign,
  LifeBuoy,
  MessageSquare,
  Inbox,
} from "lucide-react";
import { formatMoney, StatusBadge } from "@/lib/superadmin/ui";
import { PrivacyRequestsSection } from "@/components/superadmin/privacy-requests-section";

export const Route = createFileRoute("/superadmin/")({
  component: SuperAdminDashboard,
});

type Stats = Record<string, number | string>;
type Finance = Awaited<ReturnType<typeof getFinanceOverview>>;

function SuperAdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [supportStats, setSupportStats] = useState<{ open: number; urgent: number; unread: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getPlatformStats()
      .then((r) => setStats(r.stats))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
    getFinanceOverview()
      .then(setFinance)
      .catch((e) => console.error("finance", e));
    getSupportStats()
      .then(setSupportStats)
      .catch((e) => console.error("support stats", e));
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Platform overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Live snapshot of operations and revenue across Clubero.
        </p>
      </header>

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* ============== Business & Finance ============== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4" /> Business & finance
          </h2>
          <Link
            to="/superadmin/billing"
            className="text-xs text-primary hover:underline"
          >
            All subscriptions →
          </Link>
        </div>

        {!finance ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading revenue…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BigTile
              icon={<Banknote className="h-4 w-4" />}
              label="Monthly recurring revenue"
              primary={formatMoney(finance.mrr_cents, finance.currency)}
              secondary={`ARR ${formatMoney(finance.arr_cents, finance.currency)}`}
              accent="primary"
            />
            <BigTile
              icon={<Building2 className="h-4 w-4" />}
              label="Paying clubs"
              primary={String(finance.paying_clubs)}
              secondary={`ARPU ${formatMoney(finance.arpu_cents, finance.currency)}`}
            />
            <BigTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="Trial conversion (30d cohort)"
              primary={`${finance.trial_conversion_rate}%`}
              secondary={`${finance.new_subs_30d} new · ${finance.trialing} active trials`}
            />

            <MiniTile
              icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
              label="New subscriptions (30d)"
              value={finance.new_subs_30d}
            />
            <MiniTile
              icon={<ArrowDownRight className="h-3.5 w-3.5 text-destructive" />}
              label="Churned (30d)"
              value={finance.churned_30d}
              sub={`${finance.churn_rate_30d}% churn rate`}
            />
            <MiniTile
              icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              label="Past due"
              value={finance.past_due}
              sub={`${finance.trials_ending_7d} trials ending < 7d`}
              alert={finance.past_due > 0}
            />
          </div>
        )}
      </section>

      {/* ============== Operations ============== */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Operations
        </h2>

        {!stats ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <OpTile label="Clubs" value={stats.clubs_total} />
            <OpTile label="Active clubs" value={stats.clubs_active} hint="With active sub" />
            <OpTile label="Users" value={stats.users_total} />
            <OpTile label="Active subs (db)" value={stats.subs_active} />
            <OpTile label="Trials" value={stats.subs_trialing} />
            <OpTile label="Expiring < 7 days" value={stats.subs_expiring_7d} />
            <OpTile label="Events (30d)" value={stats.events_30d} />
            <OpTile label="Call-ups (30d)" value={stats.convocations_30d} />
          </div>
        )}
      </section>

      {/* ============== Support tickets ============== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" /> Support tickets
          </h2>
          <Link
            to="/superadmin/support-tickets"
            className="text-xs text-primary hover:underline"
          >
            All tickets →
          </Link>
        </div>

        {supportStats === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading support stats…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BigTile
              icon={<Inbox className="h-4 w-4" />}
              label="Open tickets"
              primary={String(supportStats.open)}
              secondary={`${supportStats.unread} unread`}
            />
            <BigTile
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              label="Urgent tickets"
              primary={String(supportStats.urgent)}
              secondary="Requires immediate attention"
              accent="primary"
            />
            <BigTile
              icon={<MessageSquare className="h-4 w-4" />}
              label="Total unread"
              primary={String(supportStats.unread)}
              secondary="Staff unread count"
            />
          </div>
        )}
      </section>

      <PrivacyRequestsSection />



      {(stats?.generated_at || finance?.generated_at) && (
        <div className="text-xs text-muted-foreground">
          Generated at{" "}
          {new Date(String(finance?.generated_at ?? stats?.generated_at)).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function BigTile({
  icon,
  label,
  primary,
  secondary,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  accent?: "primary";
}) {
  return (
    <div
      className={
        "rounded-xl border p-5 bg-card " +
        (accent === "primary"
          ? "border-primary/30 bg-gradient-to-br from-primary/10 to-card"
          : "border-border")
      }
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{primary}</div>
      {secondary && (
        <div className="text-xs text-muted-foreground mt-1">{secondary}</div>
      )}
    </div>
  );
}

function MiniTile({
  icon,
  label,
  value,
  sub,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 bg-card flex items-start gap-2 " +
        (alert ? "border-destructive/40" : "border-border")
      }
    >
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
      {alert && <StatusBadge tone="danger">!</StatusBadge>}
    </div>
  );
}

function OpTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string | undefined;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value != null ? String(value) : "—"}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
