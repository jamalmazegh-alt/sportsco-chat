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
                  {remaining > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      reste {(remaining / 100).toFixed(2)} {currency}
                    </p>
                  )}
                </div>
                {remaining > 0 &&
                  o.status !== "cancelled" &&
                  o.status !== "exempted" && (
                    <Button size="sm" onClick={() => setActive(o)}>
                      <BanknoteArrowDown className="h-3.5 w-3.5" />
                      Encaisser
                    </Button>
                  )}
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
              qc.invalidateQueries({
                queryKey: ["item-obligations", clubId, itemId],
              });
            }}
          />
        )}
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
