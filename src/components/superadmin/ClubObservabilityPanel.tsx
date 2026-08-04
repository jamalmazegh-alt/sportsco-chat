import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getClubObservability } from "@/lib/superadmin.functions";
import { redactErrorMessage } from "@/lib/observability/redact";
import { StatusBadge } from "@/lib/superadmin/ui";
import { ProductActivityFeed } from "@/components/superadmin/ProductActivityFeed";
import { formatDistanceToNowStrict } from "date-fns";
import { dateLocale } from "@/lib/date-locale";

type Data = Awaited<ReturnType<typeof getClubObservability>>;

export function ClubObservabilityPanel({ clubId }: { clubId: string }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    getClubObservability({ data: { club_id: clubId } })
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "load error"));
  }, [clubId]);

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        {t("superadmin.observability.title")}
      </h2>

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mb-3">
          {err}
        </div>
      )}
      {!data && !err && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2 mb-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("superadmin.common.loading")}
        </div>
      )}

      {data && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card
            title={t("superadmin.observability.recentErrors")}
            count={data.recent_failures.length}
            emptyLabel={t("superadmin.observability.recentErrorsEmpty")}
          >
            <ul className="divide-y divide-border">
              {data.recent_failures.map((r) => (
                <li key={r.id} className="p-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    <span className="font-medium">{r.action_type}</span>
                    <span className="text-muted-foreground">
                      · {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  {r.error_code && (
                    <div className="text-destructive mt-0.5">
                      {t("superadmin.observability.errorCode", { code: r.error_code })}
                    </div>
                  )}
                  {r.error_message && (
                    <div className="text-muted-foreground truncate mt-0.5">
                      {redactErrorMessage(r.error_message)}
                    </div>
                  )}
                  {r.actor_full_name && (
                    <div className="text-muted-foreground mt-0.5">
                      {t("superadmin.observability.byActor", { actor: r.actor_full_name })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t("superadmin.observability.activeUsers")}
            count={data.recent_active_users.length}
            emptyLabel={t("superadmin.observability.activeUsersEmpty")}
          >
            <ul className="divide-y divide-border">
              {data.recent_active_users.map((u) => (
                <li key={u.user_id} className="p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to="/superadmin/users/$userId"
                      params={{ userId: u.user_id }}
                      className="font-medium hover:underline truncate"
                    >
                      {u.full_name ?? u.user_id.slice(0, 8)}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">{u.action_count}</span>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {t("superadmin.observability.lastActionAgo", {
                      action: u.last_action_type,
                      time: formatDistanceToNowStrict(new Date(u.last_action_at), {
                        locale: dateLocale(),
                      }),
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t("superadmin.observability.featuresUsed")}
            count={data.features_used.length}
            emptyLabel={t("superadmin.observability.featuresUsedEmpty")}
          >
            <ul className="divide-y divide-border">
              {data.features_used.map((f) => (
                <li
                  key={`${f.category}-${f.action_type}`}
                  className="p-2 text-xs flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <span className="text-muted-foreground">{f.category}</span> ·{" "}
                    <span className="font-medium">{f.action_type}</span>
                  </div>
                  <span className="text-muted-foreground tabular-nums">{f.count}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t("superadmin.observability.socialConnections")}
            count={data.social_connections.length}
            emptyLabel={t("superadmin.observability.socialConnectionsEmpty")}
          >
            <ul className="divide-y divide-border">
              {data.social_connections.map((s) => (
                <li key={s.id} className="p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.network}</span>
                    {s.account_name && (
                      <span className="text-muted-foreground truncate">· {s.account_name}</span>
                    )}
                    <span className="ml-auto">
                      {s.is_active ? (
                        <StatusBadge tone="success">
                          {t("superadmin.observability.active")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="muted">
                          {t("superadmin.observability.inactive")}
                        </StatusBadge>
                      )}
                    </span>
                  </div>
                  {s.last_sync_error && (
                    <div className="text-destructive truncate mt-0.5">
                      {redactErrorMessage(s.last_sync_error)}
                    </div>
                  )}
                  {s.last_synced_at && (
                    <div className="text-muted-foreground mt-0.5">
                      {t("superadmin.observability.syncedAt", {
                        date: new Date(s.last_synced_at).toLocaleString(i18n.language),
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t("superadmin.observability.imports")}
            count={data.imports.length}
            emptyLabel={t("superadmin.observability.importsEmpty")}
          >
            <ul className="divide-y divide-border">
              {data.imports.map((i) => (
                <li key={i.id} className="p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">
                      {i.import_type}
                      {i.file_name ? ` · ${i.file_name}` : ""}
                    </span>
                    <StatusBadge
                      tone={
                        i.status === "succeeded" || i.status === "completed"
                          ? "success"
                          : i.status === "partial"
                            ? "warn"
                            : i.status === "failed"
                              ? "danger"
                              : "muted"
                      }
                    >
                      {i.status}
                    </StatusBadge>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {t("superadmin.observability.importRows", {
                      imported: i.rows_imported,
                      total: i.rows_total,
                      date: new Date(i.created_at).toLocaleString(i18n.language),
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t("superadmin.observability.invitations")}
            count={data.invites.length}
            emptyLabel={t("superadmin.observability.invitationsEmpty")}
          >
            <ul className="divide-y divide-border">
              {data.invites.map((i) => (
                <li key={`${i.kind}-${i.id}`} className="p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-medium">{i.kind}</span>
                      {i.role && <span className="text-muted-foreground"> · {i.role}</span>}
                    </div>
                    <StatusBadge
                      tone={
                        i.state === "accepted"
                          ? "success"
                          : i.state === "expired"
                            ? "muted"
                            : "warn"
                      }
                    >
                      {i.state}
                    </StatusBadge>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {new Date(i.created_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title={t("superadmin.observability.supportTickets")}
            count={data.support_tickets.length}
            emptyLabel={t("superadmin.observability.supportTicketsEmpty")}
          >
            <ul className="divide-y divide-border">
              {data.support_tickets.map((t) => (
                <li key={t.id} className="p-2 text-xs">
                  <Link
                    to="/superadmin/support-tickets/$ticketId"
                    params={{ ticketId: t.id }}
                    className="flex items-center justify-between gap-2 hover:underline"
                  >
                    <span className="font-medium truncate">{t.subject}</span>
                    <StatusBadge
                      tone={
                        t.status === "closed" || t.status === "resolved"
                          ? "muted"
                          : t.priority === "urgent" || t.priority === "high"
                            ? "danger"
                            : "info"
                      }
                    >
                      {t.status}
                    </StatusBadge>
                  </Link>
                  <div className="text-muted-foreground mt-0.5">
                    {new Date(t.created_at).toLocaleDateString()}
                    {t.priority ? ` · ${t.priority}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          {t("superadmin.observability.fullActivityFeed")}
        </div>
        <ProductActivityFeed clubId={clubId} />
      </div>
    </section>
  );
}

function Card({
  title,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="text-sm font-medium flex-1">{title}</div>
        <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
      </div>
      {count === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        <div className="max-h-80 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}
