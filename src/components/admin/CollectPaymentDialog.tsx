import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listObligationsForItem,
  recordManualPayment,
} from "@/lib/payment-checkout.functions";
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

const METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  cheque: "Chèque",
  bank_transfer: "Virement",
  helloasso: "HelloAsso",
  manual: "Autre (manuel)",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  partially_paid: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
  exempted: "bg-muted text-muted-foreground",
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
  const listFn = useServerFn(listObligationsForItem);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["item-obligations", clubId, itemId],
    enabled: open,
    queryFn: () => listFn({ data: { clubId, itemId } }),
  });

  const [active, setActive] = useState<Obligation | null>(null);
  const [reasonDialog, setReasonDialog] = useState<
    | { kind: "exempt" | "cancel"; obligation: Obligation }
    | null
  >(null);
  const [refundDialog, setRefundDialog] = useState<Obligation | null>(null);

  const exemptFn = useServerFn(exemptObligation);
  const cancelFn = useServerFn(cancelObligation);
  const reopenFn = useServerFn(reopenObligation);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["item-obligations", clubId, itemId] });

  const reopenMut = useMutation({
    mutationFn: (id: string) => reopenFn({ data: { obligationId: id } }),
    onSuccess: () => {
      toast.success("Obligation réouverte");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suivi & encaissement — {itemTitle}</DialogTitle>
        </DialogHeader>

        {q.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {q.data && q.data.obligations.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Aucune obligation pour cet item.
          </p>
        )}

        <ul className="divide-y divide-border rounded-md border border-border">
          {(q.data?.obligations as Obligation[] | undefined)?.map((o) => {
            const remaining = o.amount_due_cents - o.amount_paid_cents;
            const playerName =
              `${o.players?.first_name ?? ""} ${o.players?.last_name ?? ""}`.trim() ||
              "—";
            const currency = (o.currency || "eur").toUpperCase();
            const isClosed = o.status === "cancelled" || o.status === "exempted";
            const hasPaid = o.amount_paid_cents > 0;
            return (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{playerName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {o.payer?.name
                      ? `Payeur : ${o.payer.name}`
                      : "Payeur non lié"}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_COLORS[o.status] ?? ""}`}
                >
                  {o.status}
                </span>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {(o.amount_paid_cents / 100).toFixed(2)} /{" "}
                    {(o.amount_due_cents / 100).toFixed(2)} {currency}
                  </p>
                  {remaining > 0 && !isClosed && (
                    <p className="text-[11px] text-muted-foreground">
                      reste {(remaining / 100).toFixed(2)} {currency}
                    </p>
                  )}
                </div>
                {remaining > 0 && !isClosed && (
                  <Button size="sm" onClick={() => setActive(o)}>
                    <BanknoteArrowDown className="h-3.5 w-3.5" />
                    Encaisser
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
                        <RotateCcw className="h-4 w-4 mr-2" /> Rouvrir
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {!hasPaid && (
                          <>
                            <DropdownMenuItem
                              onClick={() =>
                                setReasonDialog({ kind: "exempt", obligation: o })
                              }
                            >
                              <ShieldOff className="h-4 w-4 mr-2" /> Exempter
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setReasonDialog({ kind: "cancel", obligation: o })
                              }
                            >
                              <Ban className="h-4 w-4 mr-2" /> Annuler
                            </DropdownMenuItem>
                          </>
                        )}
                        {hasPaid && (
                          <>
                            <DropdownMenuItem onClick={() => setRefundDialog(o)}>
                              <Undo2 className="h-4 w-4 mr-2" /> Rembourser…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <p className="px-2 py-1 text-[10px] text-muted-foreground">
                              Annulation impossible — paiements existants
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
                ? "Exempter cette obligation"
                : "Annuler cette obligation"
            }
            description={
              reasonDialog.kind === "exempt"
                ? "Le joueur sera marqué comme exempté de ce paiement. Indiquez la raison (bourse, situation familiale, etc.)."
                : "L'obligation sera annulée et ne pourra plus être payée. Précisez la raison."
            }
            confirmLabel={reasonDialog.kind === "exempt" ? "Exempter" : "Annuler l'obligation"}
            onClose={() => setReasonDialog(null)}
            onConfirm={async (reason) => {
              const fn = reasonDialog.kind === "exempt" ? exemptFn : cancelFn;
              try {
                await fn({ data: { obligationId: reasonDialog.obligation.id, reason } });
                toast.success(
                  reasonDialog.kind === "exempt"
                    ? "Obligation exemptée"
                    : "Obligation annulée",
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
          <Label className="text-xs">Raison</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Justification interne (visible dans les audits)"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
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
  const refundFn = useServerFn(refundTransaction);
  const currency = (obligation.currency || "eur").toUpperCase();

  // Load refundable transactions for this obligation
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
        (t) => (t.amount_gross_cents ?? 0) > (t.refunded_amount_cents ?? 0),
      );
    },
  });

  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const current = txQ.data?.find((t) => t.id === selectedTx) ?? null;
  const maxRefundable = current
    ? current.amount_gross_cents - (current.refunded_amount_cents ?? 0)
    : 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rembourser un paiement</DialogTitle>
        </DialogHeader>

        {txQ.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (txQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucune transaction remboursable.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Transaction à rembourser</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {txQ.data!.map((t) => {
                  const refundable =
                    t.amount_gross_cents - (t.refunded_amount_cents ?? 0);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTx(t.id);
                        setAmount((refundable / 100).toFixed(2));
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md border text-xs flex justify-between items-center ${
                        selectedTx === t.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <span>
                        {t.method} ·{" "}
                        {new Date(t.paid_at ?? t.created_at).toLocaleDateString(
                          "fr-FR",
                        )}
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
                  <Label className="text-xs">Montant à rembourser ({currency})</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={(maxRefundable / 100).toFixed(2)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Maximum : {(maxRefundable / 100).toFixed(2)} {currency}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Raison (optionnel)</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    maxLength={500}
                  />
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {current.method === "stripe"
                    ? "Remboursement Stripe automatique"
                    : "Écriture comptable manuelle (aucun mouvement bancaire)"}
                </Badge>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
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
                toast.success("Remboursement enregistré");
                onDone();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rembourser"}
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
  const recordFn = useServerFn(recordManualPayment);
  const remaining = obligation.amount_due_cents - obligation.amount_paid_cents;
  const currency = (obligation.currency || "eur").toUpperCase();
  const [method, setMethod] = useState<
    "cash" | "cheque" | "bank_transfer" | "manual"
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
      toast.success("Paiement enregistré, reçu généré");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encaisser un paiement</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mode</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as typeof method)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Montant ({currency})</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                max={(remaining / 100).toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Reste à encaisser : {(remaining / 100).toFixed(2)} {currency}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Référence (N° chèque, virement…)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="optionnel"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Commentaire</Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="optionnel"
              maxLength={500}
            />
          </div>
          <Badge variant="outline" className="text-[10px]">
            Un reçu sera émis automatiquement
          </Badge>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              save.isPending ||
              !parseFloat(amount) ||
              Math.round(parseFloat(amount || "0") * 100) > remaining
            }
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Enregistrer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
