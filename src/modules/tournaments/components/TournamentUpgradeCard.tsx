import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Upsell shown to tournament-only organizers (no club, no subscription).
 * Lets them create a club and then start a full Clubero subscription, which
 * unlocks all admin features.
 */
export function TournamentUpgradeCard() {
  const { user, refreshMemberships } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [clubName, setClubName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user?.id || !clubName.trim()) return;
    setBusy(true);
    try {
      const { data: club, error } = await supabase
        .from("clubs")
        .insert({ name: clubName.trim(), created_by: user.id })
        .select("id")
        .single();
      if (error || !club) throw new Error(error?.message ?? "Création impossible");
      const { error: mErr } = await supabase
        .from("club_members")
        .insert({ club_id: club.id, user_id: user.id, role: "admin" });
      if (mErr) throw new Error(mErr.message);
      await refreshMemberships();
      toast.success("Club créé. Redirection vers l'abonnement…");
      navigate({ to: "/admin/billing" });
    } catch (err: any) {
      toast.error(err?.message ?? "Erreur lors de la création du club.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/15 p-2">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Débloquez toutes les fonctionnalités</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Passez au plan Clubero pour gérer équipes, événements, convocations,
              stats et plus encore — tournois illimités inclus.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              S'abonner au plan Clubero
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Créer votre club</DialogTitle>
            <DialogDescription>
              Pour activer l'abonnement, nous créons d'abord votre club. Vous en
              serez l'administrateur et serez redirigé vers l'écran de paiement.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="club-name">Nom du club</Label>
              <Input
                id="club-name"
                autoFocus
                required
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="FC United"
                disabled={busy}
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full" disabled={busy || !clubName.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continuer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
