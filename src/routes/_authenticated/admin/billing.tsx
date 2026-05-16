import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useActiveRole } from "@/lib/auth-context";
import {
  getClubSubscription,
  createCheckoutSession,
  createPortalSession,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  listClubInvoices,
} from "@/lib/billing.functions";
import { UpdateCardDialog } from "@/components/billing/update-card-dialog";
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
  Loader2,
  Sparkles,
  Check,
  ExternalLink,
  AlertCircle,
  CreditCard,
  FileText,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  billing: z.enum(["success", "canceled"]).optional(),
  card: z.literal("updated").optional(),
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

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function BillingPage() {
  const { activeClubId } = useAuth();
  const role = useActiveRole();
  const search = useSearch({ from: "/_authenticated/admin/billing" });

  const fetchSub = useServerFn(getClubSubscription);
  const checkout = useServerFn(createCheckoutSession);
  const portal = useServerFn(createPortalSession);
  const cancelSub = useServerFn(cancelSubscriptionAtPeriodEnd);
  const reactivate = useServerFn(reactivateSubscription);
  const fetchInvoices = useServerFn(listClubInvoices);

  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [updateCardOpen, setUpdateCardOpen] = useState(false);

  useEffect(() => {
    if (search.billing === "success") {
      toast.success("Abonnement activé. Bienvenue dans Clubero !");
    } else if (search.billing === "canceled") {
      toast.info("Paiement annulé.");
    } else if (search.card === "updated") {
      toast.success("Carte bancaire mise à jour.");
    }
  }, [search.billing, search.card]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["club-subscription", activeClubId],
    enabled: !!activeClubId,
    queryFn: () => fetchSub({ data: { clubId: activeClubId! } }),
  });

  const sub = data?.subscription;
  const isActive = sub && ["trialing", "active", "past_due"].includes(sub.status);

  const { data: invoicesData } = useQuery({
    queryKey: ["club-invoices", activeClubId],
    enabled: !!activeClubId && !!isActive,
    queryFn: () => fetchInvoices({ data: { clubId: activeClubId! } }),
  });

  if (role !== "admin") return <Navigate to="/profile" replace />;

  if (isLoading || !activeClubId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  function navigateExternal(url: string) {
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return;
      }
    } catch {
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

  async function onCancel() {
    if (!activeClubId) return;
    setBusy("cancel");
    try {
      await cancelSub({ data: { clubId: activeClubId } });
      toast.success("Abonnement résilié. Accès maintenu jusqu'à la fin de la période en cours.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la résiliation");
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  }

  async function onReactivate() {
    if (!activeClubId) return;
    setBusy("reactivate");
    try {
      await reactivate({ data: { clubId: activeClubId } });
      toast.success("Abonnement réactivé.");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la réactivation");
    } finally {
      setBusy(null);
    }
  }

  function onUpdateCard() {
    if (!activeClubId) return;
    setUpdateCardOpen(true);
  }

  const cancelDate =
    (sub as any)?.cancel_at ?? sub?.current_period_end ?? sub?.trial_end ?? null;
  const scheduledCancel = sub && (sub.cancel_at_period_end || (sub as any).cancel_at);

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

        {scheduledCancel && cancelDate ? (
          <div className="text-sm flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-4 w-4" />
            Résilié — prend fin le {new Date(cancelDate).toLocaleDateString("fr-FR")} (pas de
            renouvellement)
          </div>
        ) : sub?.current_period_end ? (
          <div className="text-sm text-muted-foreground">
            Prochain renouvellement le{" "}
            {new Date(sub.current_period_end).toLocaleDateString("fr-FR")}
          </div>
        ) : null}

        {isActive && (
          <div className="grid gap-2 sm:grid-cols-2 pt-1">
            <Button
              onClick={onUpdateCard}
              variant="outline"
              disabled={busy === "card"}
              className="w-full"
            >
              {busy === "card" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Changer la carte
                </>
              )}
            </Button>

            {scheduledCancel ? (
              <Button
                onClick={onReactivate}
                variant="outline"
                disabled={busy === "reactivate"}
                className="w-full"
              >
                {busy === "reactivate" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Réactiver l'abonnement
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => setConfirmCancel(true)}
                variant="outline"
                disabled={busy === "cancel"}
                className="w-full text-destructive hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Résilier l'abonnement
              </Button>
            )}
          </div>
        )}

        {isActive && (
          <button
            onClick={openPortal}
            disabled={busy === "portal"}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
          >
            {busy === "portal" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                Options avancées (portail Stripe) <ExternalLink className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </section>

      {/* Invoices */}
      {isActive && invoicesData?.invoices && invoicesData.invoices.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Factures</h2>
          </div>
          <ul className="divide-y divide-border">
            {invoicesData.invoices.map((inv) => (
              <li key={inv.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {inv.number ?? inv.id}
                    {inv.status === "paid" && (
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                        payée
                      </span>
                    )}
                    {inv.status === "open" && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        à payer
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.created * 1000).toLocaleDateString("fr-FR")} ·{" "}
                    {formatAmount(inv.amount_paid || inv.amount_due, inv.currency)}
                  </p>
                </div>
                {inv.invoice_pdf && (
                  <a
                    href={inv.invoice_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    PDF <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Résilier l'abonnement&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              Votre accès reste actif jusqu'au{" "}
              {cancelDate ? new Date(cancelDate).toLocaleDateString("fr-FR") : "terme de la période en cours"}.
              Aucun nouveau prélèvement ne sera effectué. Vous pourrez réactiver à tout moment avant cette date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "cancel"}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onCancel();
              }}
              disabled={busy === "cancel"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Résilier"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
