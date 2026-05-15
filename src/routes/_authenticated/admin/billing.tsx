import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import {
  getClubSubscription,
  createCheckoutSession,
  createPortalSession,
} from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Check, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  billing: z.enum(["success", "canceled"]).optional(),
});

export const Route = createFileRoute("/_authenticated/admin/billing")({
  component: BillingPage,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Abonnement — Clubero" }] }),
});

const FEATURES = [
  "Équipes illimitées",
  "Joueurs illimités",
  "Gestion des matchs",
  "Planning des entraînements",
  "Suivi des présences",
  "Communication club",
  "Notifications",
  "Statistiques",
  "Événements",
  "Accès mobile / PWA",
  "Rôles coach & manager",
];

function StatusBadge({ status, trialEnd }: { status: string; trialEnd: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    trialing: { label: "Période d'essai", cls: "bg-primary/10 text-primary" },
    active: { label: "Actif", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    past_due: { label: "Paiement en retard", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    canceled: { label: "Annulé", cls: "bg-muted text-muted-foreground" },
    incomplete: { label: "Incomplet", cls: "bg-muted text-muted-foreground" },
    incomplete_expired: { label: "Expiré", cls: "bg-destructive/10 text-destructive" },
    unpaid: { label: "Impayé", cls: "bg-destructive/10 text-destructive" },
    paused: { label: "En pause", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      {s.label}
      {status === "trialing" && trialEnd && (
        <> · jusqu'au {new Date(trialEnd).toLocaleDateString("fr-FR")}</>
      )}
    </span>
  );
}

function BillingPage() {
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const search = useSearch({ from: "/_authenticated/admin/billing" });

  const fetchSub = useServerFn(getClubSubscription);
  const checkout = useServerFn(createCheckoutSession);
  const portal = useServerFn(createPortalSession);

  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (search.billing === "success") {
      toast.success("Abonnement activé. Bienvenue dans Clubero !");
    } else if (search.billing === "canceled") {
      toast.info("Paiement annulé.");
    }
  }, [search.billing]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["club-subscription", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => fetchSub({ data: { clubId: activeClubId! } }),
  });

  if (role !== "admin") return <Navigate to="/profile" replace />;

  if (isLoading || !activeClubId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const sub = data?.subscription;
  const isActive = sub && ["trialing", "active", "past_due"].includes(sub.status);

  function navigateExternal(url: string) {
    // Break out of any preview iframe — Stripe sets X-Frame-Options: DENY
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // cross-origin top frame: fall back to new tab
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = url;
  }

  async function startCheckout(plan: "monthly" | "yearly") {
    if (!activeClubId) return;
    setBusy(plan);
    try {
      const res = await checkout({ data: { clubId: activeClubId, plan } });
      if (res.url) navigateExternal(res.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'ouverture du paiement");
      setBusy(null);
    }
  }

  async function openPortal() {
    if (!activeClubId) return;
    setBusy("portal");
    try {
      const res = await portal({ data: { clubId: activeClubId } });
      if (res.url) navigateExternal(res.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'ouvrir le portail");
      setBusy(null);
    }
  }

  return (
    <div className="px-5 py-4 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Abonnement</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez l'abonnement Clubero de votre club.
        </p>
      </div>

      {/* Current status */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">Statut actuel</p>
            <div className="mt-1.5">
              {sub ? (
                <StatusBadge status={sub.status} trialEnd={sub.trial_end} />
              ) : (
                <span className="text-sm text-muted-foreground">Aucun abonnement</span>
              )}
            </div>
          </div>
          {sub?.plan && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Plan</p>
              <p className="font-semibold mt-1.5">
                CLUBERO {sub.plan === "yearly" ? "Annuel" : "Mensuel"}
              </p>
            </div>
          )}
        </div>

        {sub?.current_period_end && (
          <div className="text-sm text-muted-foreground">
            {sub.cancel_at_period_end ? (
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4" />
                Se termine le {new Date(sub.current_period_end).toLocaleDateString("fr-FR")}
              </span>
            ) : (
              <>Prochain renouvellement le {new Date(sub.current_period_end).toLocaleDateString("fr-FR")}</>
            )}
          </div>
        )}

        {isActive && (
          <Button onClick={openPortal} variant="outline" disabled={busy === "portal"} className="w-full">
            {busy === "portal" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Gérer mon abonnement <ExternalLink className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        )}
      </section>

      {/* Plans (when not active) */}
      {!isActive && (
        <section className="rounded-2xl border border-primary bg-card p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-lg">CLUBERO</h2>
              <p className="text-sm text-muted-foreground">Tout inclus, sans limite</p>
            </div>
          </div>

          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-sm">
            <p className="font-medium text-primary">🎁 30 jours d'essai gratuit</p>
            <p className="text-muted-foreground mt-1">
              Carte bancaire requise, mais aucun débit avant la fin de l'essai. Annulable à tout moment.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => startCheckout("monthly")}
              disabled={busy !== null}
              className="rounded-xl border-2 border-border hover:border-primary p-4 text-left transition-colors disabled:opacity-50"
            >
              <p className="text-sm text-muted-foreground">Mensuel</p>
              <p className="font-display text-2xl font-bold mt-1">39 €</p>
              <p className="text-xs text-muted-foreground">/ mois</p>
              {busy === "monthly" && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
            </button>
            <button
              onClick={() => startCheckout("yearly")}
              disabled={busy !== null}
              className="rounded-xl border-2 border-primary bg-primary/5 p-4 text-left relative disabled:opacity-50"
            >
              <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                2 mois offerts
              </span>
              <p className="text-sm text-muted-foreground">Annuel</p>
              <p className="font-display text-2xl font-bold mt-1">390 €</p>
              <p className="text-xs text-muted-foreground">/ an</p>
              {busy === "yearly" && <Loader2 className="h-4 w-4 animate-spin mt-2" />}
            </button>
          </div>

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2 border-t border-border">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-foreground/80">{f}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
