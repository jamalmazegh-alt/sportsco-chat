import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  grantBillingExemption,
  revokeBillingExemption,
} from "@/lib/billing-exemption.functions";
import { EXEMPT_REASON_LABELS, type ExemptReason } from "@/lib/has-paid-access";

type SubRow = {
  status?: string | null;
  exempt_from_billing?: boolean | null;
  exempt_reason?: string | null;
  exempt_granted_at?: string | null;
  stripe_subscription_id?: string | null;
};

export function BillingExemptionPanel({
  clubId,
  clubName,
  subscription,
  onUpdated,
}: {
  clubId: string;
  clubName: string;
  subscription: SubRow | null | undefined;
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const grantFn = useServerFn(grantBillingExemption);
  const revokeFn = useServerFn(revokeBillingExemption);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState<ExemptReason | "">("");
  const [busy, setBusy] = useState(false);

  const isExempt = subscription?.exempt_from_billing === true;
  const stripeStatus = subscription?.status ?? "no subscription";

  async function invalidateCaches() {
    await queryClient.invalidateQueries({ queryKey: ["club-subscription-full", clubId] });
    await queryClient.invalidateQueries({ queryKey: ["club-subscription-active", clubId] });
    await queryClient.invalidateQueries({ queryKey: ["club-subscription", clubId] });
    onUpdated();
  }

  async function onGrant() {
    if (!reason) return;
    setBusy(true);
    try {
      await grantFn({ data: { clubId, reason } });
      toast.success("Exemption accordée");
      setGrantOpen(false);
      setReason("");
      await invalidateCaches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    setBusy(true);
    try {
      await revokeFn({ data: { clubId } });
      toast.success("Exemption retirée");
      setRevokeOpen(false);
      await invalidateCaches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Exemption abonnement
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Stripe : <span className="font-mono">{stripeStatus}</span>
            {" · "}
            Exemption :{" "}
            <span className={isExempt ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
              {isExempt ? "active" : "inactive"}
            </span>
          </p>
          {isExempt && subscription?.exempt_reason && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Raison :{" "}
              {EXEMPT_REASON_LABELS[subscription.exempt_reason as ExemptReason] ??
                subscription.exempt_reason}
            </p>
          )}
        </div>
        {isExempt ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#86efac] bg-[#f0fdf4] px-2 py-0.5 text-[9px] font-bold uppercase text-[#16a34a]">
            <ShieldCheck className="h-3 w-3" />
            Exempté
          </span>
        ) : null}
      </div>

      <div className="flex gap-2 flex-wrap">
        {!isExempt ? (
          <Button size="sm" variant="outline" onClick={() => setGrantOpen(true)}>
            Exempter
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => setRevokeOpen(true)}>
            Retirer l&apos;exemption
          </Button>
        )}
      </div>

      <AlertDialog open={grantOpen} onOpenChange={setGrantOpen}>
        <AlertDialogContent className="rounded-[20px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Exempter {clubName}</AlertDialogTitle>
            <AlertDialogDescription>
              Accès complet sans Stripe. Aucun appel Stripe ne sera déclenché.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={reason} onValueChange={(v) => setReason(v as ExemptReason)}>
            <SelectTrigger className="rounded-xl border-[1.5px] border-[#e2e8f0]">
              <SelectValue placeholder="Raison" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(EXEMPT_REASON_LABELS) as ExemptReason[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {EXEMPT_REASON_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !reason} onClick={() => void onGrant()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer l&apos;exemption</AlertDialogTitle>
            <AlertDialogDescription>
              {clubName} perdra l&apos;accès offert si aucun abonnement Stripe actif n&apos;existe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void onRevoke()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
