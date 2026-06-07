import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTournamentPaymentSettings } from "../tournament-payments.functions";
import { getFeeRatePercent } from "@/lib/platform-fee";

interface Props {
  tournamentId: string;
  clubId: string | null;
  stripeAccountId: string | null;
  initial: {
    registration_fee: number;
    registration_currency: string;
    registration_fee_description: string | null;
    payment_mode: string;
  };
}

function parseFeeEuros(value: string): number | null {
  if (value.trim() === "") return 0;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function PaymentSettingsPanel({ tournamentId, clubId, stripeAccountId, initial }: Props) {
  const { t } = useTranslation("tournaments");
  const qc = useQueryClient();
  const updateFn = useServerFn(updateTournamentPaymentSettings);

  const [feeEuros, setFeeEuros] = useState(
    String(((initial.registration_fee ?? 0) / 100).toFixed(2)),
  );
  const [feeError, setFeeError] = useState<string | null>(null);
  const [currency, setCurrency] = useState(initial.registration_currency || "eur");
  const [description, setDescription] = useState(initial.registration_fee_description ?? "");
  const [mode, setMode] = useState(initial.payment_mode || "both");

  const stripeRequired = Boolean(clubId) && !stripeAccountId;

  const save = useMutation({
    mutationFn: () => {
      const euros = parseFeeEuros(feeEuros);
      if (euros === null) {
        throw new Error(t("payments.feeInvalid"));
      }
      if (euros < 0) {
        throw new Error(t("payments.feeMinError"));
      }
      return updateFn({
        data: {
          tournament_id: tournamentId,
          registration_fee: Math.round(euros * 100),
          registration_currency: currency as any,
          registration_fee_description: description.trim() || null,
          payment_mode: mode as any,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("payments.saved"));
      qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? t("payments.saveError")),
  });

  const parsedEuros = parseFeeEuros(feeEuros);
  const feeCents =
    parsedEuros === null || parsedEuros < 0 ? 0 : Math.round(parsedEuros * 100);
  const platformFee = Math.round(feeCents * (getFeeRatePercent(false) / 100));

  return (
    <div className="space-y-5 max-w-xl">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{t("payments.title")}</h2>
      </div>

      {!clubId && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("payments.personalTournamentWarning")}</span>
        </div>
      )}

      {stripeRequired && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex flex-col gap-2">
          <div className="flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t("payments.stripeRequired")}</span>
          </div>
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link to="/admin/settings/payments">{t("payments.connectStripe")}</Link>
          </Button>
        </div>
      )}

      <div
        className={cn(
          "space-y-5",
          stripeRequired && "pointer-events-none opacity-50 select-none",
        )}
      >
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>{t("payments.fields.fee")}</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={feeEuros}
            aria-invalid={!!feeError}
            onChange={(e) => {
              const next = e.target.value;
              setFeeEuros(next);
              const n = parseFeeEuros(next);
              if (next !== "" && (n === null || n < 0)) {
                setFeeError(t("payments.feeMinError"));
              } else {
                setFeeError(null);
              }
            }}
            onBlur={() => {
              const n = parseFeeEuros(feeEuros);
              if (feeEuros !== "" && (n === null || n < 0)) {
                setFeeError(t("payments.feeMinError"));
              }
            }}
          />
          {feeError ? (
            <p className="text-[11px] text-destructive">{feeError}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t("payments.feeHint")}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("payments.fields.currency")}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="eur">EUR €</SelectItem>
              <SelectItem value="usd">USD $</SelectItem>
              <SelectItem value="gbp">GBP £</SelectItem>
              <SelectItem value="chf">CHF</SelectItem>
              <SelectItem value="cad">CAD $</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("payments.fields.description")}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={t("payments.descriptionPlaceholder")}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("payments.fields.mode")}</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="offline">{t("payments.modes.offline")}</SelectItem>
            <SelectItem value="online">{t("payments.modes.online")}</SelectItem>
            <SelectItem value="both">{t("payments.modes.both")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {feeCents > 0 && mode !== "offline" && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p>
            {t("payments.feeBreakdown", {
              gross: (feeCents / 100).toFixed(2),
              fee: (platformFee / 100).toFixed(2),
              net: ((feeCents - platformFee) / 100).toFixed(2),
              currency: currency.toUpperCase(),
              pct: getFeeRatePercent(false),
            })}
          </p>
        </div>
      )}

      <Button
        onClick={() => save.mutate()}
        disabled={save.isPending || !!feeError || stripeRequired}
      >
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("payments.save")}
      </Button>
      </div>
    </div>
  );
}
