import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Check,
  X,
  Mail,
  Phone,
  Users,
  Clock,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listTournamentRegistrations,
  decideRegistration,
} from "../tournaments.functions";

type Status = "pending" | "approved" | "rejected" | "cancelled";

interface Reg {
  id: string;
  team_name: string;
  short_name: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  notes: string | null;
  players: any[];
  status: Status;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

export function RegistrationsManager({ tournamentId }: { tournamentId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Status | "all">("pending");
  const listFn = useServerFn(listTournamentRegistrations);
  const decideFn = useServerFn(decideRegistration);

  const q = useQuery({
    queryKey: ["tournament-registrations", tournamentId, filter],
    queryFn: () =>
      listFn({
        data: {
          tournament_id: tournamentId,
          status: filter === "all" ? null : filter,
        },
      }),
  });

  const decide = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject"; note?: string }) =>
      decideFn({
        data: {
          registration_id: vars.id,
          action: vars.action,
          decision_note: vars.note ?? null,
        },
      }),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.action === "approve" ? "Inscription validée" : "Inscription refusée",
      );
      qc.invalidateQueries({ queryKey: ["tournament-registrations", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  const regs = (q.data?.registrations ?? []) as Reg[];

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const r of regs) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [regs]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {regs.length} inscription{regs.length > 1 ? "s" : ""}
        </h2>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="approved">Validées</SelectItem>
              <SelectItem value="rejected">Refusées</SelectItem>
              <SelectItem value="cancelled">Annulées</SelectItem>
              <SelectItem value="all">Toutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.isLoading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : regs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aucune inscription {filter !== "all" ? `(${filter})` : ""}.
        </div>
      ) : (
        <ul className="space-y-2">
          {regs.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {r.team_name}
                    {r.short_name && (
                      <span className="text-muted-foreground"> · {r.short_name}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.contact_name}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <a
                    href={`mailto:${r.contact_email}`}
                    className="hover:underline"
                  >
                    {r.contact_email}
                  </a>
                </span>
                {r.contact_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {r.contact_phone}
                  </span>
                )}
                {Array.isArray(r.players) && r.players.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {r.players.length} joueur{r.players.length > 1 ? "s" : ""}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(r.created_at).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {r.notes && (
                <p className="text-xs italic text-muted-foreground whitespace-pre-wrap">
                  « {r.notes} »
                </p>
              )}

              {r.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => decide.mutate({ id: r.id, action: "approve" })}
                    disabled={decide.isPending}
                  >
                    <Check className="h-4 w-4" />
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const note = window.prompt(
                        "Motif du refus (optionnel)",
                        "",
                      );
                      if (note === null) return;
                      decide.mutate({
                        id: r.id,
                        action: "reject",
                        note: note || undefined,
                      });
                    }}
                    disabled={decide.isPending}
                  >
                    <X className="h-4 w-4" />
                    Refuser
                  </Button>
                </div>
              )}

              {r.decision_note && (
                <p className="text-[11px] text-muted-foreground">
                  Note : {r.decision_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        En attente : {counts.pending} · Validées : {counts.approved} · Refusées :{" "}
        {counts.rejected}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    pending: {
      label: "En attente",
      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    approved: {
      label: "Validée",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    rejected: {
      label: "Refusée",
      cls: "bg-destructive/15 text-destructive",
    },
    cancelled: {
      label: "Annulée",
      cls: "bg-muted text-muted-foreground",
    },
  };
  const m = map[status];
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}
