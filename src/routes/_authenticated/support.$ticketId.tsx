import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getSupportTicket, updateSupportTicket } from "@/lib/support.functions";
import { TicketThread } from "@/components/support/ticket-thread";
import { CheckCircle2, Loader2 } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { STATUS_BADGE_CLASS, type SupportStatus } from "@/lib/support-constants";
import i18n from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/support/$ticketId")({
  component: TicketDetailPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.supportTicket.title") },
      { name: "description", content: i18n.t("meta.supportTicket.description") },
    ],
  }),
});

function TicketDetailPage() {
  const { t } = useTranslation("support");
  const { ticketId } = Route.useParams();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => getSupportTicket({ data: { ticket_id: ticketId } }),
  });

  const resolve = useMutation({
    mutationFn: () =>
      updateSupportTicket({ data: { ticket_id: ticketId, status: "resolved" } }),
    onSuccess: () => {
      toast.success(t("actions.resolved_toast", { defaultValue: "Ticket marqué comme résolu" }));
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;
  const { ticket, messages } = data;
  const status = ticket.status as SupportStatus;
  const cls = STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.open;
  const canResolve = status !== "resolved" && status !== "closed";

  return (
    <div className="flex flex-col h-[100dvh] max-h-screen">
      <header className="px-5 pt-6 pb-3 border-b">
        <BackLink to="/support" label={t("page.back")} />

        <div className="flex items-start justify-between gap-3 mt-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{ticket.subject}</h1>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <span
                className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}
              >
                {t(`status.${status}`, { defaultValue: status })}
              </span>
              <span>#{ticket.id.slice(0, 6).toUpperCase()}</span>
              <span>· {t(`category.${ticket.category}`, { defaultValue: ticket.category })}</span>
            </div>
          </div>
          {canResolve && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => resolve.mutate()}
              disabled={resolve.isPending}
              className="shrink-0"
            >
              {resolve.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">
                {t("actions.mark_resolved", { defaultValue: "Marquer comme résolu" })}
              </span>
            </Button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <TicketThread
          ticketId={ticket.id}
          messages={messages.filter((m) => !m.is_internal_note)}
          isStaffView={false}
          onReplied={() => refetch()}
        />
      </div>
    </div>
  );
}
