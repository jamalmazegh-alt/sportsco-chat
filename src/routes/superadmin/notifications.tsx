import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listNotificationEmails,
  listNotificationPush,
} from "@/lib/superadmin/observability.functions";
import { StatusBadge } from "@/lib/superadmin/ui";
import { Loader2, Bell, Mail, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/superadmin/notifications")({
  component: NotificationsPage,
});

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function NotificationsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"email" | "push">("email");
  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Bell className="h-3.5 w-3.5" /> {t("superadmin.notifications.eyebrow")}
        </div>
        <h1 className="text-xl font-semibold mt-1">{t("superadmin.notifications.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t("superadmin.notifications.subtitle")}
        </p>
      </header>

      <div className="flex gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setTab("email")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "email"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          <Mail className="inline h-3.5 w-3.5 mr-1" /> {t("superadmin.notifications.emails")}
        </button>
        <button
          onClick={() => setTab("push")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "push"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          <Bell className="inline h-3.5 w-3.5 mr-1" /> {t("superadmin.notifications.push")}
        </button>
      </div>

      {tab === "email" ? <EmailsTab /> : <PushTab />}
    </div>
  );
}

function EmailsTab() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState("");
  const [status, setStatus] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "notif-emails", search, template, status],
    queryFn: () =>
      listNotificationEmails({
        data: {
          search: search || null,
          template: template || null,
          status: status || null,
          limit: 200,
        },
      }),
  });
  const rows = data?.rows ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder={t("superadmin.notifications.emailSearch")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />
        <Input
          placeholder={t("superadmin.notifications.template")}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="h-8 w-52"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-8 rounded-md border border-border bg-background text-sm px-2"
        >
          <option value="">{t("superadmin.notifications.allStatuses")}</option>
          <option value="sent">sent</option>
          <option value="delivered">delivered</option>
          <option value="pending">pending</option>
          <option value="failed">failed</option>
          <option value="dlq">dlq</option>
          <option value="suppressed">suppressed</option>
          <option value="bounced">bounced</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {t("superadmin.notifications.loadError", { message: (error as Error).message })}
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.date")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.template")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.recipient")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.status")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.error")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="hover:bg-muted/20 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {fmt(r.created_at)}
                      </td>
                      <td className="px-3 py-2">{r.template_name}</td>
                      <td className="px-3 py-2 truncate max-w-[240px]">{r.recipient_email}</td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          tone={
                            r.status === "sent" || r.status === "delivered"
                              ? "success"
                              : r.status === "pending" || r.status === "processing"
                                ? "info"
                                : r.status === "suppressed"
                                  ? "warn"
                                  : "danger"
                          }
                        >
                          {r.status}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-xs text-destructive truncate max-w-[240px]">
                        {r.error_message}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/20">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                            <div>
                              <span className="text-muted-foreground">
                                {t("superadmin.notifications.messageId")}
                              </span>{" "}
                              <span className="font-mono">{r.message_id}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">
                                {t("superadmin.notifications.attempts")}
                              </span>{" "}
                              {r.attempt_count}
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground">
                                {t("superadmin.notifications.metadata")}
                              </span>
                              <pre className="mt-1 rounded bg-background border border-border p-2 overflow-x-auto text-[11px]">
                                {JSON.stringify(r.metadata, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("superadmin.notifications.noEmail")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PushTab() {
  const { t } = useTranslation();
  const [kind, setKind] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["superadmin", "notif-push", kind],
    queryFn: () => listNotificationPush({ data: { kind: kind || null, limit: 200 } }),
  });
  const rows = data?.rows ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder={t("superadmin.notifications.typePlaceholder")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-8 w-64"
        />
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {t("superadmin.notifications.loadError", { message: (error as Error).message })}
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.date")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.type")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.ref")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.targets")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.sent")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.opened")}</th>
                <th className="text-left px-3 py-2">{t("superadmin.notifications.firstOpened")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {fmt(r.dispatched_at)}
                  </td>
                  <td className="px-3 py-2">{r.kind}</td>
                  <td
                    className="px-3 py-2 text-xs font-mono text-muted-foreground truncate max-w-[160px]"
                    title={r.ref_id}
                  >
                    {r.ref_id ? r.ref_id.slice(0, 8) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.targets_count}</td>
                  <td className="px-3 py-2">{r.sent_count}</td>
                  <td className="px-3 py-2">{r.opened_count}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.first_opened_at ? fmt(r.first_opened_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("superadmin.notifications.noPush")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
