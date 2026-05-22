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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createTournamentPassCheckout } from "@/modules/tournaments/server/passes.functions";

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
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const checkout = useServerFn(createTournamentPassCheckout);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await checkout({ data: { email: email.trim() } });
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} className={className}>
          <Trophy className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pass Tournoi — 40 €</DialogTitle>
          <DialogDescription>
            Un paiement unique pour organiser un tournoi complet avec Clubero Tournaments.
            Reçois ton lien d'organisateur par e-mail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
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
