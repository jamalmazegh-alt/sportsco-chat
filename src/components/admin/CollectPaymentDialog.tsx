import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { listObligationsForItem, recordManualPayment } from "@/lib/payment-checkout.functions";
import {
  exemptObligation,
  cancelObligation,
  reopenObligation,
  refundTransaction,
} from "@/lib/payment-refunds.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  BanknoteArrowDown,
  MoreVertical,
  Ban,
  ShieldOff,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

type Obligation = {
  id: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  status: string;
  payer: { name: string | null } | null;
  players: { first_name: string | null; last_name: string | null } | null;
};

const METHOD_KEYS = ["cash", "cheque", "bank_transfer", "helloasso", "manual"] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  partially_paid: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
  exempted: "bg-muted text-muted-foreground",
};

const STATUS_I18N: Record<string, string> = {
  pending: "payments.status.pending",
  partially_paid: "payments.status.partiallyPaid",
  paid: "payments.status.paid",
  cancelled: "payments.status.cancelled",
  exempted: "payments.status.exempted",
};

export function CollectPaymentDialog({
  clubId,
  itemId,
  itemTitle,
  open,
  onOpenChange,
}: {
  clubId: string;
  itemId: string;
  itemTitle: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const listFn = useServerFn(listObligationsForItem);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["item-obligations", clubId, itemId],
    enabled: open,
    queryFn: () => listFn({ data: { clubId, itemId } }),
  });

  const [active, setActive] = useState<Obligation | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{
    kind: "exempt" | "cancel";
    obligation: Obligation;
  } | null>(null);
  const [refundDialog, setRefundDialog] = useState<Obligation | null>(null);

  const exemptFn = useServerFn(exemptObligation);
  const cancelFn = useServerFn(cancelObligation);
  const reopenFn = useServerFn(reopenObligation);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["item-obligations", clubId, itemId] });

  const reopenMut = useMutation({
    mutationFn: (id: string) => reopenFn({ data: { obligationId: id } }),
    onSuccess: () => {
      toast.success(t("adminPayments.reopened"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("adminPayments.collectTitle", { title: itemTitle })}</DialogTitle>
        </DialogHeader>

        {q.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {q.isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {t("adminPayments.loadError", {
              message: (q.error as Error)?.message ?? t("adminPayments.unknownError"),
            })}
          </div>
        )}

        {q.data && q.data.obligations.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t("adminPayments.emptyObligations")}
          </p>
        )}

        <ul className="divide-y divide-border rounded-md border border-border">
          {(q.data?.obligations as Obligation[] | undefined)?.map((o) => {
            const remaining = o.amount_due_cents - o.amount_paid_cents;
            const playerName =
              `${o.players?.first_name ?? ""} ${o.players?.last_name ?? ""}`.trim() || "—";
            const currency = (o.currency || "eur").toUpperCase();
            const isClosed = o.status === "cancelled" || o.status === "exempted";
            const hasPaid = o.amount_paid_cents > 0;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{playerName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {o.payer?.name
                      ? t("adminPayments.payer", { name: o.payer.name })
                      : t("adminPayments.payerUnlinked")}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_COLORS[o.status] ?? ""}`}
                >
                  {STATUS_I18N[o.status] ? t(STATUS_I18N[o.status]) : o.status}
                </span>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {(o.amount_paid_cents / 100).toFixed(2)} /{" "}
                    {(o.amount_due_cents / 100).toFixed(2)} {currency}
                  </p>
                  {remaining > 0 && !isClosed && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("adminPayments.remaining", {
                        amount: (remaining / 100).toFixed(2),
                        currency,
                      })}
                    </p>
                  )}
                </div>
                {remaining > 0 && !isClosed && (
                  <Button size="sm" onClick={() => setActive(o)}>
                    <BanknoteArrowDown className="h-3.5 w-3.5" />
                    {t("adminPayments.collect")}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {isClosed ? (
                      <DropdownMenuItem
                        onClick={() => reopenMut.mutate(o.id)}
                        disabled={reopenMut.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" /> {t("adminPayments.reopen")}
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {!hasPaid && (
                          <>
                            <DropdownMenuItem
                              onClick={() => setReasonDialog({ kind: "exempt", obligation: o })}
                            >
                              <ShieldOff className="h-4 w-4 mr-2" /> {t("adminPayments.exempt")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setReasonDialog({ kind: "cancel", obligation: o })}
                            >
                              <Ban className="h-4 w-4 mr-2" /> {t("common.cancel")}
                            </DropdownMenuItem>
                          </>
                        )}
                        {hasPaid && (
                          <>
                            <DropdownMenuItem onClick={() => setRefundDialog(o)}>
                              <Undo2 className="h-4 w-4 mr-2" /> {t("adminPayments.refundEllipsis")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <p className="px-2 py-1 text-[10px] text-muted-foreground">
                              {t("adminPayments.cancelBlocked")}
                            </p>
                          </>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>

        {active && (
          <ManualPaymentForm
            clubId={clubId}
            obligation={active}
            onClose={() => setActive(null)}
            onSaved={() => {
              setActive(null);
              invalidate();
            }}
          />
        )}

        {reasonDialog && (
          <ReasonDialog
            title={
              reasonDialog.kind === "exempt"
                ? t("adminPayments.exemptTitle")
                : t("adminPayments.cancelTitle")
            }
            description={
              reasonDialog.kind === "exempt"
                ? t("adminPayments.exemptDescription")
                : t("adminPayments.cancelDescription")
            }
            confirmLabel={
              reasonDialog.kind === "exempt"
                ? t("adminPayments.exempt")
                : t("adminPayments.cancelConfirm")
            }
            onClose={() => setReasonDialog(null)}
            onConfirm={async (reason) => {
              const fn = reasonDialog.kind === "exempt" ? exemptFn : cancelFn;
              try {
                await fn({ data: { obligationId: reasonDialog.obligation.id, reason } });
                toast.success(
                  reasonDialog.kind === "exempt"
                    ? t("adminPayments.exempted")
                    : t("adminPayments.cancelled"),
                );
                setReasonDialog(null);
                invalidate();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        )}

        {refundDialog && (
          <RefundDialog
            clubId={clubId}
            obligation={refundDialog}
            onClose={() => setRefundDialog(null)}
            onDone={() => {
              setRefundDialog(null);
              invalidate();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Reason dialog ---------------------------- */

function ReasonDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("adminPayments.reason")}</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t("adminPayments.reasonPlaceholder")}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!reason.trim() || pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Refund dialog ---------------------------- */

function RefundDialog({
  clubId: _clubId,
  obligation,
  onClose,
  onDone,
}: {
  clubId: string;
  obligation: Obligation;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const refundFn = useServerFn(refundTransaction);
  const currency = (obligation.currency || "eur").toUpperCase();

  const txQ = useQuery({
    queryKey: ["obligation-refundable", obligation.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select(
          "id, method, status, amount_gross_cents, refunded_amount_cents, currency, created_at, paid_at",
        )
        .eq("obligation_id", obligation.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter(
        (tx) => (tx.amount_gross_cents ?? 0) > (tx.refunded_amount_cents ?? 0),
      );
    },
  });

  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const current = txQ.data?.find((tx) => tx.id === selectedTx) ?? null;
  const maxRefundable = current
    ? current.amount_gross_cents - (current.refunded_amount_cents ?? 0)
    : 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adminPayments.refundTitle")}</DialogTitle>
        </DialogHeader>

        {txQ.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (txQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("adminPayments.noRefundable")}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("adminPayments.refundTransaction")}</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {txQ.data!.map((tx) => {
                  const refundable = tx.amount_gross_cents - (tx.refunded_amount_cents ?? 0);
                  const methodLabel = t(`payments.method.${tx.method}`, {
                    defaultValue: tx.method,
                  });
                  return (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => {
                        setSelectedTx(tx.id);
                        setAmount((refundable / 100).toFixed(2));
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md border text-xs flex justify-between items-center ${
                        selectedTx === tx.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span>
                        {methodLabel} ·{" "}
                        {new Date(tx.paid_at ?? tx.created_at).toLocaleDateString(i18n.language)}
                      </span>
                      <span className="font-medium">
                        {(refundable / 100).toFixed(2)} {currency}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {current && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("adminPayments.refundAmount", { currency })}</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={(maxRefundable / 100).toFixed(2)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("adminPayments.maximum", {
                      amount: (maxRefundable / 100).toFixed(2),
                      currency,
                    })}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("adminPayments.reasonOptional")}</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                  />
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {current.method === "stripe"
                    ? t("adminPayments.refundStripe")
                    : t("adminPayments.refundManual")}
                </Badge>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            disabled={
              !selectedTx ||
              pending ||
              !parseFloat(amount) ||
              Math.round(parseFloat(amount || "0") * 100) > maxRefundable
            }
            onClick={async () => {
              if (!selectedTx) return;
              setPending(true);
              try {
                await refundFn({
                  data: {
                    transactionId: selectedTx,
                    amountCents: Math.round(parseFloat(amount || "0") * 100),
                    reason: reason.trim() || null,
                  },
                });
                toast.success(t("adminPayments.refunded"));
                onDone();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.payments.refund")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualPaymentForm({
  clubId,
  obligation,
  onClose,
  onSaved,
}: {
  clubId: string;
  obligation: Obligation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const recordFn = useServerFn(recordManualPayment);
  const remaining = obligation.amount_due_cents - obligation.amount_paid_cents;
  const currency = (obligation.currency || "eur").toUpperCase();
  const [method, setMethod] = useState<
    "cash" | "cheque" | "bank_transfer" | "manual" | "helloasso"
  >("cash");
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [reference, setReference] = useState("");
  const [comment, setComment] = useState("");

  const save = useMutation({
    mutationFn: () =>
      recordFn({
        data: {
          clubId,
          obligationId: obligation.id,
          method,
          amountCents: Math.round(parseFloat(amount || "0") * 100),
          externalReference: reference.trim() || null,
          comment: comment.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success(t("adminPayments.paymentRecorded"));
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adminPayments.manualCollectTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("adminPayments.mode")}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {key === "manual"
                        ? t("adminPayments.methodOther")
                        : t(`payments.method.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("adminPayments.amount", { currency })}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                max={(remaining / 100).toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("adminPayments.remainingToCollect", {
                  amount: (remaining / 100).toFixed(2),
                  currency,
                })}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("adminPayments.reference")}</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("common.optional")}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("adminPayments.comment")}</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("common.optional")}
              maxLength={500}
            />
          </div>
          <Badge variant="outline" className="text-[10px]">
            {t("adminPayments.receiptAuto")}
          </Badge>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              save.isPending ||
              !parseFloat(amount) ||
              Math.round(parseFloat(amount || "0") * 100) > remaining
            }
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
