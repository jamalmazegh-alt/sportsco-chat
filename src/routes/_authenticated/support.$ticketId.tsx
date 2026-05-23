import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getSupportTicket } from "@/lib/support.functions";
import { TicketThread } from "@/components/support/ticket-thread";
import { ArrowLeft, Loader2 } from "lucide-react";
import { STATUS_BADGE_CLASS, type SupportStatus } from "@/lib/support-constants";

export const Route = createFileRoute("/_authenticated/support/$ticketId")({
  component: TicketDetailPage,
  head: () => ({ meta: [{ title: "Demande — Clubero" }] }),
});

function TicketDetailPage() {
  const { t } = useTranslation("support");
  const { ticketId } = Route.useParams();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => getSupportTicket({ data: { ticket_id: ticketId } }),
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

  return (
    <div className="flex flex-col h-[100dvh] max-h-screen">
      <header className="px-5 pt-6 pb-3 border-b">
        <BackLink to="/support" label={t("page.back")} />

        <h1 className="text-lg font-semibold mt-2">{ticket.subject}</h1>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
            {t(`status.${status}`, { defaultValue: status })}
          </span>
          <span>#{ticket.id.slice(0, 6).toUpperCase()}</span>
          <span>· {t(`category.${ticket.category}`, { defaultValue: ticket.category })}</span>
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
