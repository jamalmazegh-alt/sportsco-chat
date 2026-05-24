import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2, Trophy, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createTournamentPassCheckout } from "@/modules/tournaments/passes.functions";
import { useAuth } from "@/lib/auth-context";

interface TournamentPassButtonProps {
  className?: string;
  variant?: "default" | "outline";
  label?: string;
}

const UNIT_PRICE_EUR = 40;

function QuantityStepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={disabled || value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(Math.min(20, Math.max(1, n)));
        }}
        className="h-9 w-16 text-center"
        disabled={disabled}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={disabled || value >= 20}
        onClick={() => onChange(Math.min(20, value + 1))}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function TournamentPassButton({
  className,
  variant = "outline",
  label,
}: TournamentPassButtonProps) {
  const { t } = useTranslation("tournaments");
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const checkout = useServerFn(createTournamentPassCheckout);
  const resolvedLabel = label ?? t("pass.buyLabel");

  async function startCheckout(emailToUse: string, qty: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await checkout({
        data: {
          email: emailToUse.trim(),
          quantity: qty,
          ...(user?.email ? { return_to: "/tournaments/new-from-pass" } : {}),
        },
      });
      if (res.url) {
        window.location.href = res.url;
      } else {
        toast.error(t("pass.paymentImpossible"));
        setBusy(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? t("pass.paymentError"));
      setBusy(false);
    }
  }

  const total = (UNIT_PRICE_EUR * quantity).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        <Trophy className="h-4 w-4" />
        {resolvedLabel}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pass.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("pass.dialogDesc")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startCheckout(user?.email ?? email, quantity);
          }}
          className="space-y-4"
        >
          {!user?.email && (
            <div className="space-y-2">
              <Label htmlFor="pass-email">{t("pass.emailLabel")}</Label>
              <Input
                id="pass-email"
                type="email"
                required
                autoFocus
                placeholder={t("pass.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>
              {t("pass.quantityLabel", { defaultValue: "Nombre de pass" })}
            </Label>
            <QuantityStepper value={quantity} onChange={setQuantity} disabled={busy} />
            <p className="text-xs text-muted-foreground">
              {t("pass.unitPriceHint", {
                defaultValue: "{{price}} € par pass · Total : {{total}} €",
                price: UNIT_PRICE_EUR.toFixed(2),
                total,
              })}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={busy || (!user?.email && !email.includes("@"))}
              className="w-full"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("pass.continuePay")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
