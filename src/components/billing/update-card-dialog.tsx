import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCardSetupIntent } from "@/lib/billing.functions";

const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(pk: string) {
  if (!stripePromiseCache.has(pk)) {
    stripePromiseCache.set(pk, loadStripe(pk));
  }
  return stripePromiseCache.get(pk)!;
}

function SetupForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/admin/billing?card=updated`,
      },
    });
    if (confirmError) {
      setError(confirmError.message ?? "Erreur lors de l'enregistrement de la carte");
      setSubmitting(false);
      return;
    }
    if (setupIntent && setupIntent.status === "succeeded") {
      toast.success("Carte bancaire mise à jour.");
      onSuccess();
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={!stripe || !elements || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

export function UpdateCardDialog({
  open,
  onOpenChange,
  clubId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string | null;
  onSuccess?: () => void;
}) {
  const createIntent = useServerFn(createCardSetupIntent);
  const [state, setState] = useState<{
    clientSecret: string;
    publishableKey: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const requestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !clubId) return;
    if (requestedFor.current === clubId && state) return;
    requestedFor.current = clubId;
    setLoading(true);
    setState(null);
    createIntent({ data: { clubId } })
      .then((res) => {
        setState({ clientSecret: res.clientSecret, publishableKey: res.publishableKey });
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Impossible de préparer la mise à jour");
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, clubId]);

  useEffect(() => {
    if (!open) {
      requestedFor.current = null;
      setState(null);
    }
  }, [open]);

  const stripePromise = useMemo(
    () => (state ? getStripePromise(state.publishableKey) : null),
    [state],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Changer la carte bancaire</DialogTitle>
          <DialogDescription>
            Votre nouvelle carte remplacera l'actuelle pour les prochains prélèvements.
          </DialogDescription>
        </DialogHeader>
        {loading || !state || !stripePromise ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: state.clientSecret,
              appearance: { theme: "stripe" },
              locale: "fr",
            }}
          >
            <SetupForm
              onSuccess={() => {
                onSuccess?.();
                onOpenChange(false);
              }}
              onCancel={() => onOpenChange(false)}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
