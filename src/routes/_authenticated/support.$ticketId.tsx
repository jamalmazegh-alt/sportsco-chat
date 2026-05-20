import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSupportTicket } from "@/lib/support.functions";
import { TicketThread } from "@/components/support/ticket-thread";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/support/$ticketId")({
  component: TicketDetailPage,
  head: () => ({ meta: [{ title: "Demande — Clubero" }] }),
});

const STATUS_LABELS: Record<string, { l: string; cls: string }> = {
  open: { l: "Ouvert", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  in_progress: { l: "En cours", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  waiting_user: { l: "En attente de vous", cls: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200" },
  resolved: { l: "Résolu", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  closed: { l: "Fermé", cls: "bg-muted text-muted-foreground" },
};

function TicketDetailPage() {
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
  const s = STATUS_LABELS[ticket.status] ?? STATUS_LABELS.open;

  return (
    <div className="flex flex-col h-[100dvh] max-h-screen">
      <header className="px-5 pt-6 pb-3 border-b">
        <Link to="/support" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Mes demandes
        </Link>
        <h1 className="text-lg font-semibold mt-2">{ticket.subject}</h1>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${s.cls}`}>{s.l}</span>
          <span>#{ticket.id.slice(0, 6).toUpperCase()}</span>
          <span>· {ticket.category}</span>
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
