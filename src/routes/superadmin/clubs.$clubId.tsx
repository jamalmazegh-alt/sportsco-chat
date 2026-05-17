import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  getClubDetailExtended,
  getClubFinancials,
  archiveClub,
  unarchiveClub,
} from "@/lib/superadmin.functions";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  MessageCircle,
  Calendar,
  Users,
  Trophy,
  Receipt,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge, subTone, roleTone, Avatar, trialCountdown, formatMoney } from "@/lib/superadmin/ui";

export const Route = createFileRoute("/superadmin/clubs/$clubId")({
  component: ClubDetail,
});

function ClubDetail() {
  const { clubId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getClubDetailExtended>> | null>(null);
  const [fin, setFin] = useState<Awaited<ReturnType<typeof getClubFinancials>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setErr(null);
    getClubDetailExtended({ data: { club_id: clubId } })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
    getClubFinancials({ data: { club_id: clubId } })
      .then(setFin)
      .catch((e) => console.error("financials", e));
  }, [clubId]);

  useEffect(refresh, [refresh]);

  const runArchive = async (archive: boolean) => {
    const label = archive ? "Archive club" : "Restore club";
    if (!window.confirm(`${label} — are you sure?`)) return;
    setBusy(true);
    try {
      if (archive) await archiveClub({ data: { club_id: clubId } });
      else await unarchiveClub({ data: { club_id: clubId } });
      toast.success(`${label} done`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (err) return <div className="p-8 text-sm text-destructive">{err}</div>;
  if (!data)
    return (
      <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );

  const { club, subscription, teams, members, recent_events, recent_convocations, whatsapp_configured_count } = data;
  if (!club) return <div className="p-8 text-sm">Club not found.</div>;
  const archived = Boolean((club as { archived_at?: string | null }).archived_at);
  const sub = subTone(subscription?.status);
  const trial = trialCountdown(subscription?.trial_end ?? null);
  const sports = Array.from(new Set(teams.map((t) => t.sport).filter(Boolean) as string[]));
  const activeTeams = teams.filter((t) => !t.deleted_at);
  const convoCount = recent_convocations.length;
  const positive = recent_convocations.filter((c) => c.status === "present").length;
  const respRate = convoCount > 0 ? Math.round((positive / convoCount) * 100) : null;

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link
        to="/superadmin/clubs"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All clubs
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Avatar url={club.logo_url} name={club.name} size={64} />
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2 flex-wrap">
              {club.name}
              {archived && <StatusBadge tone="warn">Archived</StatusBadge>}
              <StatusBadge tone={sub.tone}>{sub.label}</StatusBadge>
              {trial && (
                <StatusBadge tone={trial === "expired" ? "danger" : "info"}>
                  trial: {trial}
                </StatusBadge>
              )}
            </h1>
            <div className="text-[11px] font-mono text-muted-foreground mt-1">{club.id}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Created {new Date(club.created_at).toLocaleDateString()}
              {sports.length > 0 && <> · {sports.join(", ")}</>}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={archived ? "outline" : "destructive"}
          disabled={busy}
          onClick={() => runArchive(!archived)}
        >
          {archived ? (
            <><ArchiveRestore className="h-4 w-4 mr-1.5" /> Restore</>
          ) : (
            <><Archive className="h-4 w-4 mr-1.5" /> Archive</>
          )}
        </Button>
      </header>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI icon={<Users className="h-4 w-4" />} label="Members" value={members.length} />
        <KPI icon={<Trophy className="h-4 w-4" />} label="Teams" value={`${activeTeams.length}/${teams.length}`} />
        <KPI icon={<Calendar className="h-4 w-4" />} label="Recent events" value={recent_events.length} />
        <KPI
          icon={<MessageCircle className="h-4 w-4" />}
          label="WhatsApp teams"
          value={`${whatsapp_configured_count}/${teams.length}`}
        />
      </section>

      {/* ============== Financials ============== */}
      <section className="mb-6">
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Financials
            </h2>
            {fin?.has_stripe === false && (
              <StatusBadge tone="muted">No Stripe customer</StatusBadge>
            )}
          </div>
          {!fin ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <KPI
                  icon={<Receipt className="h-4 w-4" />}
                  label="Lifetime paid"
                  value={formatMoney(fin.lifetime_paid_cents, fin.currency)}
                />
                <KPI
                  icon={<Receipt className="h-4 w-4" />}
                  label="Invoices"
                  value={fin.invoices.length}
                />
                <KPI
                  icon={<Calendar className="h-4 w-4" />}
                  label="Next charge"
                  value={
                    fin.upcoming_amount_cents != null
                      ? formatMoney(fin.upcoming_amount_cents, fin.currency)
                      : "—"
                  }
                />
                <KPI
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Card"
                  value={
                    fin.payment_method
                      ? `${fin.payment_method.brand} ··${fin.payment_method.last4}`
                      : "—"
                  }
                />
              </div>

              {fin.invoices.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Date</th>
                        <th className="text-left font-medium px-3 py-2">Number</th>
                        <th className="text-left font-medium px-3 py-2">Status</th>
                        <th className="text-right font-medium px-3 py-2">Amount</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fin.invoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-border">
                          <td className="px-3 py-2 text-muted-foreground">
                            {new Date(inv.created * 1000).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{inv.number ?? inv.id.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            <StatusBadge
                              tone={
                                inv.status === "paid"
                                  ? "success"
                                  : inv.status === "open"
                                    ? "warn"
                                    : inv.status === "uncollectible" || inv.status === "void"
                                      ? "danger"
                                      : "muted"
                              }
                            >
                              {inv.status ?? "—"}
                            </StatusBadge>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(inv.amount_paid || inv.amount_due, inv.currency)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {inv.hosted_invoice_url && (
                              <a
                                href={inv.hosted_invoice_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                View <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No invoices yet.</div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card title="Subscription">
          {subscription ? (
            <dl className="text-sm space-y-1.5">
              <Row label="Status"><StatusBadge tone={sub.tone}>{sub.label}</StatusBadge></Row>
              <Row label="Plan">{subscription.plan ?? "—"}</Row>
              <Row label="Trial end">
                {subscription.trial_end ? (
                  <span className="flex items-center gap-1.5">
                    {new Date(subscription.trial_end).toLocaleDateString()}
                    {trial && <span className="text-xs text-muted-foreground">({trial})</span>}
                  </span>
                ) : "—"}
              </Row>
              <Row label="Period end">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</Row>
              <Row label="Cancel at period end">{subscription.cancel_at_period_end ? "Yes" : "No"}</Row>
              <Row label="Stripe customer">
                <span className="font-mono text-xs">{subscription.stripe_customer_id ?? "—"}</span>
              </Row>
              {respRate !== null && (
                <Row label="Response rate (recent)">{respRate}%</Row>
              )}
            </dl>
          ) : (
            <div className="text-sm text-muted-foreground">No subscription record.</div>
          )}
        </Card>

        <Card title={`Teams (${teams.length})`}>
          {teams.length === 0 && <div className="text-sm text-muted-foreground">No teams.</div>}
          <ul className="text-sm divide-y divide-border -mx-1">
            {teams.map((t) => (
              <li key={t.id} className="px-1 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={t.deleted_at ? "line-through text-muted-foreground" : "font-medium"}>
                    {t.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[t.sport, t.age_group, t.championship].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {t.whatsapp_group_url && <StatusBadge tone="success">WA</StatusBadge>}
                  <StatusBadge tone="muted">{t.communication_mode}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card title="Recent events">
          {recent_events.length === 0 && (
            <div className="text-sm text-muted-foreground">No events.</div>
          )}
          <ul className="space-y-1.5 text-sm">
            {recent_events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span className={(e.deleted_at || e.cancelled_at) ? "line-through text-muted-foreground truncate" : "truncate"}>
                  {e.title}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  <StatusBadge tone={e.cancelled_at ? "danger" : e.deleted_at ? "muted" : "info"}>
                    {e.type}
                  </StatusBadge>
                  {new Date(e.starts_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={`Members (${members.length})`}>
          <ul className="divide-y divide-border -mx-1 max-h-80 overflow-auto">
            {members.map((m) => {
              const name = m.profile?.full_name || `${m.profile?.first_name ?? ""} ${m.profile?.last_name ?? ""}`.trim() || "—";
              return (
                <li key={m.user_id} className="px-1 py-2 flex items-center gap-3">
                  <Avatar url={m.profile?.avatar_url} name={name} size={32} />
                  <Link
                    to="/superadmin/users/$userId"
                    params={{ userId: m.user_id }}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <div className="text-sm font-medium truncate">{name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.profile?.phone ?? m.user_id.slice(0, 8)}</div>
                  </Link>
                  <StatusBadge tone={roleTone(m.role)}>{m.role}</StatusBadge>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">{title}</div>
      {children}
    </div>
  );
}

function KPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
