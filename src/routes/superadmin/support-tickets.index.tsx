import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listAllSupportTickets } from "@/lib/support.functions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, LifeBuoy, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/superadmin/support-tickets/")({
  component: AdminTicketsPage,
});

const STATUSES = ["all", "open", "in_progress", "waiting_user", "resolved", "closed"] as const;
const PRIORITIES = ["all", "low", "normal", "high", "urgent"] as const;
const CATEGORIES = ["all", "bug", "payment", "account", "team", "event", "feature_request", "other"] as const;

const STATUS_CLS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  waiting_user: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  closed: "bg-muted text-muted-foreground",
};
const PRIORITY_CLS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function AdminTicketsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-support-tickets", { search, status, priority, category }],
    queryFn: () =>
      listAllSupportTickets({
        data: {
          search: search || undefined,
          status: status === "all" ? undefined : (status as "open"),
          priority: priority === "all" ? undefined : (priority as "low"),
          category: category === "all" ? undefined : (category as "bug"),
          limit: 100,
        },
      }),
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <LifeBuoy className="h-3.5 w-3.5" /> Support tickets
        </div>
        <h1 className="text-xl font-semibold mt-1">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tickets utilisateurs · réponses, statuts, priorités.
        </p>
      </header>

      <div className="grid sm:grid-cols-4 gap-2 mb-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un sujet…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "Tous statuts" : s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger><SelectValue placeholder="Priorité" /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p === "all" ? "Toutes priorités" : p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:col-start-4"><SelectValue placeholder="Catégorie" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "Toutes catégories" : c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Aucun ticket.
        </div>
      ) : (
        <ul className="border rounded-lg divide-y bg-card">
          {data.map((t) => (
            <li key={t.id}>
              <Link
                to="/superadmin/support-tickets/$ticketId"
                params={{ ticketId: t.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{t.subject}</span>
                    {t.staff_unread_count > 0 && (
                      <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                        {t.staff_unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_CLS[t.status] ?? ""}`}>{t.status}</span>
                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_CLS[t.priority] ?? ""}`}>{t.priority}</span>
                    <span>· {t.category}</span>
                    <span>· #{t.id.slice(0, 6).toUpperCase()}</span>
                    {t.user_full_name && <span>· {t.user_full_name}</span>}
                    <span>· {new Date(t.last_activity_at).toLocaleString()}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
