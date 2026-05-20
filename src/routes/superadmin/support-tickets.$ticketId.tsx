import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getSupportTicket, updateSupportTicket } from "@/lib/support.functions";
import { TicketThread } from "@/components/support/ticket-thread";
import { ArrowLeft, Loader2, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/superadmin/support-tickets/$ticketId")({
  component: AdminTicketDetail,
});

const STATUSES = ["open", "in_progress", "waiting_user", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

function AdminTicketDetail() {
  const { ticketId } = Route.useParams();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-support-ticket", ticketId],
    queryFn: () => getSupportTicket({ data: { ticket_id: ticketId } }),
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
      toast.success("Mis à jour");
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!data) return null;
  const { ticket, messages, owner } = data;
  const ctx = (ticket.context_data ?? {}) as Record<string, unknown>;

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] max-h-screen">
      {/* Thread */}
      <div className="flex-1 flex flex-col overflow-hidden border-r">
        <header className="px-5 pt-6 pb-3 border-b">
          <Link to="/superadmin/support-tickets" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Inbox
          </Link>
          <h1 className="text-lg font-semibold mt-2">{ticket.subject}</h1>
          <div className="text-xs text-muted-foreground mt-1">#{ticket.id.slice(0, 6).toUpperCase()} · {ticket.category}</div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <TicketThread
            ticketId={ticket.id}
            messages={messages}
            isStaffView
            onReplied={() => refetch()}
          />
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-full md:w-80 shrink-0 border-t md:border-t-0 bg-muted/20 overflow-y-auto p-5 space-y-5">
        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Statut</Label>
          <Select value={ticket.status} onValueChange={(v) => update.mutate({ status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Priorité</Label>
          <Select value={ticket.priority} onValueChange={(v) => update.mutate({ priority: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Utilisateur</Label>
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
                Voir le club →
              </Link>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Contexte</Label>
          <dl className="rounded-md border bg-card p-3 text-xs space-y-1.5">
            {ctx.url ? <Row k="URL" v={String(ctx.url)} /> : null}
            {ctx.viewport ? <Row k="Viewport" v={String(ctx.viewport)} /> : null}
            {ctx.locale ? <Row k="Langue" v={String(ctx.locale)} /> : null}
            {ctx.user_agent ? <Row k="UA" v={String(ctx.user_agent)} /> : null}
            {ctx.user_intent ? <Row k="Intention" v={String(ctx.user_intent)} /> : null}
            <Row k="Créé" v={new Date(ticket.created_at).toLocaleString()} />
          </dl>
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
