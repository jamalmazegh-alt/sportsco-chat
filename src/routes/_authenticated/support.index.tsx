import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listMySupportTickets } from "@/lib/support.functions";
import { Button } from "@/components/ui/button";
import { SupportFormDialog } from "@/components/support-form-dialog";
import { LifeBuoy, Plus, ChevronRight, Loader2 } from "lucide-react";
import { STATUS_BADGE_CLASS, type SupportStatus } from "@/lib/support-constants";
import i18n from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/support/")({
  component: SupportListPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.support.title") },
      { name: "description", content: i18n.t("meta.support.description") },
    ],
  }),
});

function SupportListPage() {
  const { t } = useTranslation("support");
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
            {t("page.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("page.subtitle")}</p>
        </div>
        <Button onClick={() => setOpen(true)} size="sm">
          <Plus className="h-4 w-4" /> {t("page.new")}
        </Button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center space-y-3">
          <LifeBuoy className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">{t("page.empty")}</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t("page.report")}</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((ticket) => {
            const status = ticket.status as SupportStatus;
            const cls = STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.open;
            return (
              <li key={ticket.id}>
                <Link
                  to="/support/$ticketId"
                  params={{ ticketId: ticket.id }}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-accent/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{ticket.subject}</span>
                      {ticket.user_unread_count > 0 && (
                        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                          {ticket.user_unread_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>
                        {t(`status.${status}`, { defaultValue: status })}
                      </span>
                      <span>· #{ticket.id.slice(0, 6).toUpperCase()}</span>
                      <span>· {new Date(ticket.last_activity_at).toLocaleDateString()}</span>
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
