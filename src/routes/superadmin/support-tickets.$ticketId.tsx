import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getSupportTicket,
  updateSupportTicket,
  getSupportTicketAudit,
} from "@/lib/support.functions";
import { TicketThread } from "@/components/support/ticket-thread";
import { ArrowLeft, Loader2, User, History } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/support-tickets/$ticketId")({
  component: AdminTicketDetail,
});

const STATUSES = ["open", "in_progress", "waiting_user", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

function AdminTicketDetail() {
  const { t } = useTranslation();
  const ACTION_LABELS: Record<string, string> = {
    created: t("superadmin.tickets.actionCreated"),
    status_changed: t("superadmin.tickets.actionStatus"),
    priority_changed: t("superadmin.tickets.actionPriority"),
    assigned: t("superadmin.tickets.actionAssigned"),
    reply: t("superadmin.tickets.actionReply"),
    internal_note: t("superadmin.tickets.actionNote"),
  };
  const { ticketId } = Route.useParams();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-support-ticket", ticketId],
    queryFn: () => getSupportTicket({ data: { ticket_id: ticketId } }),
  });

  const { data: audit, refetch: refetchAudit } = useQuery({
    queryKey: ["admin-support-ticket-audit", ticketId],
    queryFn: () => getSupportTicketAudit({ data: { ticket_id: ticketId } }),
  });

  const update = useMutation({
    mutationFn: (patch: { status?: string; priority?: string }) =>
      updateSupportTicket({
        data: {
          ticket_id: ticketId,
          status: patch.status as "open" | undefined,
          priority: patch.priority as "low" | undefined,
        },
      }),
    onSuccess: () => {
      toast.success(t("superadmin.tickets.updated"));
      refetch();
      refetchAudit();
    },

    onError: (e) => toast.error(e instanceof Error ? e.message : t("superadmin.tickets.error")),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;
  const { ticket, messages, owner } = data;
  const ctx = (ticket.context_data ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col md:flex-row md:h-[100dvh] md:max-h-screen">
      {/* Thread */}
      <div className="flex-1 flex flex-col md:overflow-hidden md:border-r">
        <header className="px-5 pt-6 pb-3 border-b">
          <Link
            to="/superadmin/support-tickets"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> {t("superadmin.tickets.inbox")}
          </Link>
          <h1 className="text-lg font-semibold mt-2">{ticket.subject}</h1>
          <div className="text-xs text-muted-foreground mt-1">
            #{ticket.id.slice(0, 6).toUpperCase()} · {ticket.category}
          </div>
        </header>
        <div className="flex-1 md:overflow-y-auto px-5 py-4">
          <TicketThread
            ticketId={ticket.id}
            messages={messages}
            isStaffView
            onReplied={() => {
              refetch();
              refetchAudit();
            }}
          />
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-full md:w-80 shrink-0 border-t md:border-t-0 bg-muted/20 md:overflow-y-auto p-5 space-y-5">
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("superadmin.tickets.status")}
          </Label>
          <Select value={ticket.status} onValueChange={(v) => update.mutate({ status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("superadmin.tickets.priority")}
          </Label>
          <Select value={ticket.priority} onValueChange={(v) => update.mutate({ priority: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("superadmin.tickets.user")}
          </Label>
          <div className="rounded-md border bg-card p-3 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{owner.full_name ?? "—"}</span>
            </div>
            {owner.email && (
              <div className="text-xs text-muted-foreground mt-1 truncate">{owner.email}</div>
            )}
            {ticket.club_id && (
              <Link
                to="/superadmin/clubs/$clubId"
                params={{ clubId: ticket.club_id }}
                className="text-xs text-primary hover:underline mt-1 block"
              >
                {t("superadmin.tickets.viewClub")}
              </Link>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("superadmin.tickets.context")}
          </Label>
          <dl className="rounded-md border bg-card p-3 text-xs space-y-1.5">
            {ctx.url ? <Row k="URL" v={String(ctx.url)} /> : null}
            {ctx.viewport ? <Row k="Viewport" v={String(ctx.viewport)} /> : null}
            {ctx.locale ? <Row k={t("superadmin.tickets.locale")} v={String(ctx.locale)} /> : null}
            {ctx.user_agent ? <Row k="UA" v={String(ctx.user_agent)} /> : null}
            {ctx.user_intent ? (
              <Row k={t("superadmin.tickets.intent")} v={String(ctx.user_intent)} />
            ) : null}
            <Row
              k={t("superadmin.tickets.created")}
              v={new Date(ticket.created_at).toLocaleString()}
            />
          </dl>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1">
            <History className="h-3 w-3" /> {t("superadmin.tickets.history")}
          </Label>
          <ol className="rounded-md border bg-card p-3 text-xs space-y-2 max-h-80 overflow-y-auto">
            {!audit || audit.length === 0 ? (
              <li className="text-muted-foreground italic">{t("superadmin.tickets.noActions")}</li>
            ) : (
              audit.map((row) => {
                const label = ACTION_LABELS[row.action] ?? row.action;
                const who =
                  row.actor_name ??
                  (row.actor_role === "staff" ? t("superadmin.tickets.support") : "—");
                const when = new Date(row.created_at).toLocaleString();
                let detail: string | null = null;
                if (row.action === "status_changed" || row.action === "priority_changed") {
                  detail = `${row.from_value ?? "—"} → ${row.to_value ?? "—"}`;
                } else if (row.action === "assigned") {
                  detail = row.to_value
                    ? t("superadmin.tickets.assigned")
                    : t("superadmin.tickets.unassigned");
                } else if (row.action === "reply" || row.action === "internal_note") {
                  detail = row.to_value
                    ? `« ${row.to_value.slice(0, 80)}${row.to_value.length > 80 ? "…" : ""} »`
                    : null;
                }
                return (
                  <li key={row.id} className="flex flex-col gap-0.5 pb-2 border-b last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">{when}</span>
                    </div>
                    <div className="text-muted-foreground">
                      <span className="font-medium text-foreground">{who}</span>
                      {detail ? ` · ${detail}` : null}
                    </div>
                  </li>
                );
              })
            )}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-all">{v}</dd>
    </div>
  );
}
