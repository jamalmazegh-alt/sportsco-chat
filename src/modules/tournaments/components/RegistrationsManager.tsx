import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
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
  Banknote,
  Undo2,
  Send,
  Copy,
  MessageCircle,
  ChevronDown,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listTournamentRegistrations,
  decideRegistration,
} from "../tournaments.functions";
import {
  markRegistrationPaidOffline,
  refundRegistrationPayment,
  sendPaymentLinkToTeam,
} from "../tournament-payments.functions";

type Status = "pending" | "approved" | "rejected" | "cancelled";
type PaymentStatus =
  | "pending"
  | "paid_online"
  | "paid_offline"
  | "refunded"
  | "refund_pending"
  | "free";

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
  payment_status?: PaymentStatus | null;
  amount_paid?: number | null;
  currency?: string | null;
}

export function RegistrationsManager({ tournamentId }: { tournamentId: string }) {
  const { t, i18n } = useTranslation("tournaments");
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

  const markPaidFn = useServerFn(markRegistrationPaidOffline);
  const refundFn = useServerFn(refundRegistrationPayment);

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
        vars.action === "approve" ? t("registrations.approved") : t("registrations.rejected"),
      );
      qc.invalidateQueries({ queryKey: ["tournament-registrations", tournamentId] });
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("registrations.errorToast")),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => markPaidFn({ data: { registration_id: id } }),
    onSuccess: () => {
      toast.success(t("registrations.payments.markedPaid"));
      qc.invalidateQueries({ queryKey: ["tournament-registrations", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("registrations.errorToast")),
  });

  const refund = useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      refundFn({ data: { registration_id: vars.id, reason: vars.reason ?? null } }),
    onSuccess: () => {
      toast.success(t("registrations.payments.refunded"));
      qc.invalidateQueries({ queryKey: ["tournament-registrations", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("registrations.errorToast")),
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
          {t("registrations.count", { count: regs.length })}
        </h2>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">{t("registrations.filter.pending")}</SelectItem>
              <SelectItem value="approved">{t("registrations.filter.approved")}</SelectItem>
              <SelectItem value="rejected">{t("registrations.filter.rejected")}</SelectItem>
              <SelectItem value="cancelled">{t("registrations.filter.cancelled")}</SelectItem>
              <SelectItem value="all">{t("registrations.filter.all")}</SelectItem>
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
          {t("registrations.empty", {
            suffix: filter !== "all" ? ` (${t(`registrations.filter.${filter}`)})` : "",
          })}
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
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={r.status} />
                  {r.payment_status && r.payment_status !== "free" && (
                    <PaymentBadge status={r.payment_status} />
                  )}
                </div>
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
                    {t("registrations.players", { count: r.players.length })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(r.created_at).toLocaleString(
                    i18n.language === "fr" ? "fr-FR" : "en-US",
                    {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
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
                    {t("registrations.approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const note = window.prompt(
                        t("registrations.rejectPrompt"),
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
                    {t("registrations.reject")}
                  </Button>
                </div>
              )}

              {/* Payment actions */}
              {(r.payment_status === "pending" ||
                r.payment_status === "paid_online") && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
                  {r.payment_status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markPaid.mutate(r.id)}
                      disabled={markPaid.isPending}
                    >
                      <Banknote className="h-4 w-4" />
                      {t("registrations.payments.markPaid")}
                    </Button>
                  )}
                  {r.payment_status === "paid_online" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reason = window.prompt(
                          t("registrations.payments.refundPrompt"),
                          "",
                        );
                        if (reason === null) return;
                        if (
                          !window.confirm(
                            t("registrations.payments.refundConfirm"),
                          )
                        )
                          return;
                        refund.mutate({ id: r.id, reason: reason || undefined });
                      }}
                      disabled={refund.isPending}
                    >
                      <Undo2 className="h-4 w-4" />
                      {t("registrations.payments.refund")}
                    </Button>
                  )}
                </div>
              )}

              {r.decision_note && (
                <p className="text-[11px] text-muted-foreground">
                  {t("registrations.note", { note: r.decision_note })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        {t("registrations.summary", {
          pending: counts.pending,
          approved: counts.approved,
          rejected: counts.rejected,
        })}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation("tournaments");
  const cls: Record<Status, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rejected: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls[status]}`}
    >
      {t(`registrations.status.${status}`)}
    </span>
  );
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation("tournaments");
  const cls: Record<PaymentStatus, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    paid_online: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    paid_offline: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    refunded: "bg-muted text-muted-foreground",
    refund_pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    free: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls[status]}`}
    >
      {t(`registrations.payments.status.${status}`)}
    </span>
  );
}
