import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Trophy } from "lucide-react";
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

export function TournamentPassButton({
  className,
  variant = "outline",
  label = "Acheter un pass 40 €",
}: TournamentPassButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const checkout = useServerFn(createTournamentPassCheckout);

  async function startCheckout(emailToUse: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await checkout({
        data: {
          email: emailToUse.trim(),
          ...(user?.email ? { return_to: "/tournaments/new-from-pass" } : {}),
        },
      });
      if (res.url) {
        window.location.href = res.url;
      } else {
        toast.error("Impossible de démarrer le paiement.");
        setBusy(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création du paiement.");
      setBusy(false);
    }
  }

  // Logged-in: skip dialog, go straight to Stripe using the account email.
  if (user?.email) {
    return (
      <Button
        variant={variant}
        className={className}
        disabled={busy}
        onClick={() => startCheckout(user.email!)}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
        {label}
      </Button>
    );
  }

  // Anonymous: ask for an email so we can attach the pass when they sign up.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        <Trophy className="h-4 w-4" />
        {label}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pass Tournoi — 40 €</DialogTitle>
          <DialogDescription>
            Un paiement unique par tournoi. Indiquez l'e-mail qui servira à
            créer votre compte organisateur.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startCheckout(email);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="pass-email">E-mail</Label>
            <Input
              id="pass-email"
              type="email"
              required
              autoFocus
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !email.includes("@")} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continuer vers le paiement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
