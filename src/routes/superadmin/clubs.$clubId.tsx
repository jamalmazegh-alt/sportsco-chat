import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18nInstance from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import {
  getClubDetailExtended,
  getClubFinancials,
  getClubRoster,
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
import {
  StatusBadge,
  subTone,
  roleTone,
  Avatar,
  trialCountdown,
  formatMoney,
} from "@/lib/superadmin/ui";
import { BillingExemptionPanel } from "@/components/superadmin/BillingExemptionPanel";
import {
  OnboardingProgress,
  type OnboardingStep,
} from "@/components/superadmin/OnboardingProgress";
import { ClubObservabilityPanel } from "@/components/superadmin/ClubObservabilityPanel";
import { RecomputeCategoriesPanel } from "@/components/superadmin/RecomputeCategoriesPanel";

export const Route = createFileRoute("/superadmin/clubs/$clubId")({
  component: ClubDetail,
});

function ClubDetail() {
  const { t } = useTranslation();
  const { clubId } = Route.useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof getClubDetailExtended>> | null>(null);
  const [fin, setFin] = useState<Awaited<ReturnType<typeof getClubFinancials>> | null>(null);
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof getClubRoster>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setErr(null);
    getClubDetailExtended({ data: { club_id: clubId } })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : t("superadmin.common.failed")));
    getClubFinancials({ data: { club_id: clubId } })
      .then(setFin)
      .catch((e) => console.error("financials", e));
    getClubRoster({ data: { club_id: clubId } })
      .then(setRoster)
      .catch((e) => console.error("roster", e));
  }, [clubId]);

  useEffect(refresh, [refresh]);

  const runArchive = async (archive: boolean) => {
    const label = archive
      ? t("superadmin.clubDetail.archiveClub")
      : t("superadmin.clubDetail.restoreClub");
    if (!window.confirm(`${label} — are you sure?`)) return;
    setBusy(true);
    try {
      if (archive) await archiveClub({ data: { club_id: clubId } });
      else await unarchiveClub({ data: { club_id: clubId } });
      toast.success(t("superadmin.clubDetail.actionDone", { label }));
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("superadmin.common.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (err) return <div className="p-8 text-sm text-destructive">{err}</div>;
  if (!data)
    return (
      <div className="p-8 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("superadmin.clubDetail.loading")}
      </div>
    );

  const {
    club,
    subscription,
    teams,
    members,
    recent_events,
    recent_convocations,
    whatsapp_configured_count,
  } = data;
  if (!club) return <div className="p-8 text-sm">{t("superadmin.clubDetail.notFound")}</div>;
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
        <ArrowLeft className="h-3.5 w-3.5" /> {t("superadmin.clubDetail.allClubs")}
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Avatar url={club.logo_url} name={club.name} size={64} />
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2 flex-wrap">
              {club.name}
              {archived && (
                <StatusBadge tone="warn">{t("superadmin.clubDetail.archived")}</StatusBadge>
              )}
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
            <>
              <ArchiveRestore className="h-4 w-4 mr-1.5" /> {t("superadmin.clubDetail.restore")}
            </>
          ) : (
            <>
              <Archive className="h-4 w-4 mr-1.5" /> {t("superadmin.clubDetail.archive")}
            </>
          )}
        </Button>
      </header>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI
          icon={<Users className="h-4 w-4" />}
          label={t("superadmin.clubDetail.members")}
          value={members.length}
        />
        <KPI
          icon={<Trophy className="h-4 w-4" />}
          label={t("superadmin.clubDetail.teams")}
          value={`${activeTeams.length}/${teams.length}`}
        />
        <KPI
          icon={<Calendar className="h-4 w-4" />}
          label={t("superadmin.clubDetail.recentEvents")}
          value={recent_events.length}
        />
        <KPI
          icon={<MessageCircle className="h-4 w-4" />}
          label={t("superadmin.clubDetail.whatsappTeams")}
          value={`${whatsapp_configured_count}/${teams.length}`}
        />
      </section>

      <div className="mb-6">
        <a
          href={`/superadmin/clubs/${clubId}/invites`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted/50"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t("superadmin.clubDetail.viewInviteStatus")}
        </a>
      </div>

      <OnboardingProgress
        title={t("superadmin.clubDetail.clubOnboarding")}
        className="mb-6"
        steps={buildClubOnboardingSteps(data)}
      />

      <div className="mb-6">
        <BillingExemptionPanel
          clubId={clubId}
          clubName={club.name}
          subscription={subscription as any}
          onUpdated={refresh}
        />
      </div>

      {/* ============== Financials ============== */}
      <section className="mb-6">
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-card p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" /> {t("superadmin.clubDetail.financials")}
            </h2>
            {fin?.has_stripe === false && (
              <StatusBadge tone="muted">{t("superadmin.clubDetail.noStripeCustomer")}</StatusBadge>
            )}
          </div>
          {!fin ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />{" "}
              {t("superadmin.clubDetail.loadingInvoices")}
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <KPI
                  icon={<Receipt className="h-4 w-4" />}
                  label={t("superadmin.clubDetail.lifetimePaid")}
                  value={formatMoney(fin.lifetime_paid_cents, fin.currency)}
                />
                <KPI
                  icon={<Receipt className="h-4 w-4" />}
                  label={t("superadmin.clubDetail.invoices")}
                  value={fin.invoices.length}
                />
                <KPI
                  icon={<Calendar className="h-4 w-4" />}
                  label={t("superadmin.clubDetail.nextCharge")}
                  value={
                    fin.upcoming_amount_cents != null
                      ? formatMoney(fin.upcoming_amount_cents, fin.currency)
                      : "—"
                  }
                />
                <KPI
                  icon={<CreditCard className="h-4 w-4" />}
                  label={t("superadmin.clubDetail.card")}
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
                        <th className="text-left font-medium px-3 py-2">
                          {t("superadmin.common.date")}
                        </th>
                        <th className="text-left font-medium px-3 py-2">
                          {t("superadmin.clubDetail.number")}
                        </th>
                        <th className="text-left font-medium px-3 py-2">
                          {t("superadmin.common.status")}
                        </th>
                        <th className="text-right font-medium px-3 py-2">
                          {t("superadmin.clubDetail.amount")}
                        </th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fin.invoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-border">
                          <td className="px-3 py-2 text-muted-foreground">
                            {new Date(inv.created * 1000).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {inv.number ?? inv.id.slice(0, 10)}
                          </td>
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
                <div className="text-sm text-muted-foreground">
                  {t("superadmin.clubDetail.noInvoices")}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card title={t("superadmin.clubDetail.subscription")}>
          {subscription ? (
            <dl className="text-sm space-y-1.5">
              <Row label="Status">
                <StatusBadge tone={sub.tone}>{sub.label}</StatusBadge>
              </Row>
              <Row label={t("superadmin.common.plan")}>{subscription.plan ?? "—"}</Row>
              <Row label={t("superadmin.clubDetail.trialEnd")}>
                {subscription.trial_end ? (
                  <span className="flex items-center gap-1.5">
                    {new Date(subscription.trial_end).toLocaleDateString()}
                    {trial && <span className="text-xs text-muted-foreground">({trial})</span>}
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label={t("superadmin.clubDetail.periodEnd")}>
                {subscription.current_period_end
                  ? new Date(subscription.current_period_end).toLocaleDateString()
                  : "—"}
              </Row>
              <Row label={t("superadmin.clubDetail.cancelAtPeriodEnd")}>
                {subscription.cancel_at_period_end ? "Yes" : "No"}
              </Row>
              <Row label={t("superadmin.clubDetail.stripeCustomer")}>
                <span className="font-mono text-xs">{subscription.stripe_customer_id ?? "—"}</span>
              </Row>
              {respRate !== null && (
                <Row label={t("superadmin.clubDetail.responseRate")}>{respRate}%</Row>
              )}
            </dl>
          ) : (
            <div className="text-sm text-muted-foreground">
              {t("superadmin.clubDetail.noSubscriptionRecord")}
            </div>
          )}
        </Card>

        <Card title={`Teams (${teams.length})`}>
          {teams.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {t("superadmin.clubDetail.noTeams")}
            </div>
          )}
          <ul className="text-sm divide-y divide-border -mx-1">
            {teams.map((t) => (
              <li key={t.id} className="px-1 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className={t.deleted_at ? "line-through text-muted-foreground" : "font-medium"}
                  >
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

      <section className="mb-6">
        <Card title={t("superadmin.clubDetail.rosterRecap")}>
          {!roster ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading roster…
            </div>
          ) : roster.rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {t("superadmin.clubDetail.noTeams")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-2 pr-3">
                      {t("superadmin.clubDetail.team")}
                    </th>
                    <th className="text-right font-medium py-2 px-2 tabular-nums">
                      {t("superadmin.clubDetail.coaches")}
                    </th>
                    <th className="text-right font-medium py-2 px-2 tabular-nums">
                      {t("superadmin.clubDetail.parents")}
                    </th>
                    <th className="text-right font-medium py-2 px-2 tabular-nums">
                      {t("superadmin.clubDetail.players")}
                    </th>
                    <th className="text-right font-medium py-2 px-2 tabular-nums">
                      {t("superadmin.clubDetail.other")}
                    </th>
                    <th className="text-right font-medium py-2 pl-2 tabular-nums">
                      {t("superadmin.clubDetail.total")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {roster.rows.map((r) => (
                    <tr key={r.team_id} className={r.archived ? "text-muted-foreground" : ""}>
                      <td className="py-2 pr-3">
                        <div className={r.archived ? "line-through" : "font-medium"}>{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[r.sport, r.age_group].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums">{r.coaches}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{r.parents}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{r.players}</td>
                      <td className="text-right py-2 px-2 tabular-nums">{r.other}</td>
                      <td className="text-right py-2 pl-2 tabular-nums font-semibold">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 pr-3 text-xs uppercase tracking-wide">
                      Club total (active teams)
                    </td>
                    <td className="text-right py-2 px-2 tabular-nums">{roster.totals.coaches}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{roster.totals.parents}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{roster.totals.players}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{roster.totals.other}</td>
                    <td className="text-right py-2 pl-2 tabular-nums">{roster.totals.total}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="text-[11px] text-muted-foreground mt-2">
                Coaches include admin/dirigeant. Counts are distinct users (or player rows).
                Archived teams are shown but excluded from the club total.
              </p>
            </div>
          )}
        </Card>
      </section>

      <section className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card title="Recent events">
          {recent_events.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {t("superadmin.clubDetail.noEvents")}
            </div>
          )}
          <ul className="space-y-1.5 text-sm">
            {recent_events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span
                  className={
                    e.deleted_at || e.cancelled_at
                      ? "line-through text-muted-foreground truncate"
                      : "truncate"
                  }
                >
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
              const name =
                m.profile?.full_name ||
                `${m.profile?.first_name ?? ""} ${m.profile?.last_name ?? ""}`.trim() ||
                "—";
              return (
                <li key={m.user_id} className="px-1 py-2 flex items-center gap-3">
                  <Avatar url={m.profile?.avatar_url} name={name} size={32} />
                  <Link
                    to="/superadmin/users/$userId"
                    params={{ userId: m.user_id }}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <div className="text-sm font-medium truncate">{name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {m.profile?.phone ?? m.user_id.slice(0, 8)}
                    </div>
                  </Link>
                  <StatusBadge tone={roleTone(m.role)}>{m.role}</StatusBadge>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <RecomputeCategoriesPanel clubId={clubId} />

      <ClubObservabilityPanel clubId={clubId} />
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

function KPI({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
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

type ClubDetailData = NonNullable<Awaited<ReturnType<typeof getClubDetailExtended>>>;

function buildClubOnboardingSteps(data: ClubDetailData): OnboardingStep[] {
  const club = data.club as {
    logo_url?: string | null;
    theme_color?: string | null;
    name?: string | null;
  } | null;
  const counts = data.counts ?? {
    players: 0,
    invites: 0,
    published_events: 0,
    sponsors: 0,
    has_payment_settings: false,
  };
  const activeTeams = (data.teams ?? []).filter((t) => !t.deleted_at);
  const sub = data.subscription as { status?: string | null } | null;
  const subActive =
    !!sub && ["active", "trialing", "past_due"].includes((sub.status ?? "").toLowerCase());

  const tr = i18nInstance.t.bind(i18nInstance);
  return [
    {
      id: "logo",
      label: tr("superadmin.clubOnboarding.logo"),
      done: !!club?.logo_url,
      hint: tr("superadmin.clubOnboarding.logoHint"),
    },
    {
      id: "branding",
      label: tr("superadmin.clubOnboarding.branding"),
      done: !!club?.theme_color,
      hint: tr("superadmin.clubOnboarding.brandingHint"),
    },
    {
      id: "team",
      label: tr("superadmin.clubOnboarding.team"),
      done: activeTeams.length > 0,
      hint: tr("superadmin.clubDetail.hintNoTeam"),
    },
    {
      id: "players",
      label: tr("superadmin.clubOnboarding.players"),
      done: counts.players > 0,
      hint: tr("superadmin.clubOnboarding.playersHint"),
    },
    {
      id: "invites",
      label: tr("superadmin.clubOnboarding.invites"),
      done: counts.invites > 0,
      hint: tr("superadmin.clubDetail.hintNoInvite"),
    },
    {
      id: "event",
      label: tr("superadmin.clubOnboarding.event"),
      done: counts.published_events > 0,
      hint: tr("superadmin.clubDetail.hintNoEvent"),
    },
    {
      id: "sponsor",
      label: tr("superadmin.clubOnboarding.sponsor"),
      done: counts.sponsors > 0,
      hint: tr("superadmin.clubOnboarding.sponsorHint"),
    },
    {
      id: "payments",
      label: tr("superadmin.clubOnboarding.payments"),
      done: counts.has_payment_settings,
      hint: tr("superadmin.clubOnboarding.paymentsHint"),
    },
    {
      id: "subscription",
      label: tr("superadmin.clubOnboarding.subscription"),
      done: subActive,
      hint: tr("superadmin.clubDetail.hintNoPlan"),
    },
  ];
}
