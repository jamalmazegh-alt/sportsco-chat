import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMySupportTickets } from "@/lib/support.functions";
import { Button } from "@/components/ui/button";
import { SupportFormDialog } from "@/components/support-form-dialog";
import { LifeBuoy, Plus, ChevronRight, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/support/")({
  component: SupportListPage,
  head: () => ({ meta: [{ title: "Support — Clubero" }] }),
});

const STATUS_LABELS: Record<string, { l: string; cls: string }> = {
  open: { l: "Ouvert", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  in_progress: { l: "En cours", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  waiting_user: { l: "En attente", cls: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200" },
  resolved: { l: "Résolu", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  closed: { l: "Fermé", cls: "bg-muted text-muted-foreground" },
};

function SupportListPage() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: () => listMySupportTickets(),
  });

  return (
    <div className="px-5 pt-8 pb-8 space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-primary" />
            Mes demandes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivez vos demandes de support et signalez un nouveau problème.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="h-4 w-4" /> Nouvelle
        </Button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center space-y-3">
          <LifeBuoy className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Signaler un problème</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((t) => {
            const s = STATUS_LABELS[t.status] ?? STATUS_LABELS.open;
            return (
              <li key={t.id}>
                <Link
                  to="/support/$ticketId"
                  params={{ ticketId: t.id }}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-accent/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{t.subject}</span>
                      {t.user_unread_count > 0 && (
                        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                          {t.user_unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${s.cls}`}>{s.l}</span>
                      <span>· #{t.id.slice(0, 6).toUpperCase()}</span>
                      <span>· {new Date(t.last_activity_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <SupportFormDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) refetch(); }} />
    </div>
  );
}
