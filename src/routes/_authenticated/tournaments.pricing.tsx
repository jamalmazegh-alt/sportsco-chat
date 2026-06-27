import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy, Check, Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import i18n from "@/lib/i18n";
import {
  createTournamentPlanCheckout,
  listMyTournamentEntitlements,
} from "@/modules/tournaments/entitlements.functions";

export const Route = createFileRoute("/_authenticated/tournaments/pricing")({
  component: TournamentPricingPage,
  validateSearch: (s: Record<string, unknown>) => ({
    canceled: s.canceled === "1" ? ("1" as const) : undefined,
  }),
  head: () => ({
    meta: [
      {
        title: i18n.t("pricing.metaTitle", {
          ns: "tournaments",
          defaultValue: "Facturation tournois — Clubero",
        }),
      },
      {
        name: "description",
        content: i18n.t("pricing.metaDesc", {
          ns: "tournaments",
          defaultValue:
            "Choisissez votre plan pour organiser un tournoi avec Clubero — 39€ à l'unité ou 149€/an en illimité.",
        }),
      },
    ],
  }),
});

function TournamentPricingPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const checkoutFn = useServerFn(createTournamentPlanCheckout);
  const entFn = useServerFn(listMyTournamentEntitlements);
  const [pendingPlan, setPendingPlan] = useState<"single" | "annual" | null>(null);

  const entQ = useQuery({
    queryKey: ["my-tournament-entitlements"],
    queryFn: () => entFn({ data: undefined as never }),
  });

  const checkout = useMutation({
    mutationFn: async (plan: "single" | "annual") => {
      setPendingPlan(plan);
      return checkoutFn({
        data: {
          plan,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
    },
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
      else {
        toast.error("Impossible d'initier le paiement");
        setPendingPlan(null);
      }
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPendingPlan(null);
    },
  });

  const hasAnnual = !!entQ.data?.activeAnnual;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Hero — Anime Premium green gradient */}
      <header
        className="relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #0f4a26 0%, #1d7a45 60%, #2d9d5f 100%)",
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 200 200"
          className="absolute -right-8 -top-8 h-56 w-56 opacity-10"
        >
          <path fill="currentColor" d="M100 20l20 50h52l-42 32 16 60-46-34-46 34 16-60-42-32h52z" />
        </svg>
        <div className="relative mx-auto max-w-3xl px-5 pt-10 pb-12">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 text-white/90 hover:bg-white/10 hover:text-white"
            onClick={() => navigate({ to: "/tournaments" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux tournois
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/80">Facturation tournois</p>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">
                Lancez votre tournoi en 30 secondes
              </h1>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm text-white/90 sm:text-base">
            Notre assistant IA configure votre tournoi en quelques questions — poules, phases
            finales, planning. Choisissez votre plan ci-dessous.
          </p>
        </div>
      </header>

      {search.canceled && (
        <div className="mx-auto mt-6 max-w-3xl px-5">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Paiement annulé. Vous pouvez réessayer quand vous le souhaitez.
          </div>
        </div>
      )}

      {hasAnnual && (
        <div className="mx-auto mt-6 max-w-3xl px-5">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
            <Check className="h-4 w-4" />
            Vous avez déjà un <strong>Pass Annuel</strong> actif — création illimitée jusqu'au{" "}
            {entQ.data?.activeAnnual?.valid_until
              ? new Date(entQ.data.activeAnnual.valid_until!).toLocaleDateString("fr-FR")
              : "—"}
            .
          </div>
        </div>
      )}

      {/* 2 plan cards */}
      <section className="mx-auto mt-10 grid max-w-4xl gap-5 px-5 sm:grid-cols-2">
        {/* Plan 1 — Single */}
        <PlanCard
          name="Tournoi unique"
          price="39 €"
          per="HT, paiement unique"
          tagline="Pour organiser un tournoi ponctuel"
          features={[
            "1 tournoi à organiser",
            "Création en 30 s avec l'IA",
            "Poules, phases finales, classements",
            "Inscriptions en ligne & TV publique",
            "Pas d'expiration",
          ]}
          cta="Créer mon tournoi — 39 €"
          loading={checkout.isPending && pendingPlan === "single"}
          onClick={() => checkout.mutate("single")}
          disabled={hasAnnual}
        />

        {/* Plan 2 — Annual */}
        <PlanCard
          name="Pass Annuel"
          price="149 €"
          per="HT / an, sans engagement"
          tagline="Tournois illimités pendant 12 mois"
          features={[
            "Tournois illimités",
            "Renouvellement automatique annuel",
            "Toutes les fonctionnalités Pro",
            "Économisez dès le 4ème tournoi",
            "Support prioritaire",
          ]}
          highlight
          badge="MEILLEURE VALEUR"
          cta={hasAnnual ? "Pass actif" : "Prendre le Pass — 149 €/an"}
          loading={checkout.isPending && pendingPlan === "annual"}
          onClick={() => checkout.mutate("annual")}
          disabled={hasAnnual}
          footnote="Économie réalisée dès 4 tournois (149 € au lieu de 156 €)"
        />
      </section>

      <p className="mx-auto mt-8 max-w-3xl px-5 text-center text-xs text-muted-foreground">
        Paiement sécurisé via Stripe · Facture automatique · TVA collectée selon votre pays
      </p>

      <div className="mx-auto mt-6 max-w-3xl px-5 text-center">
        <Link
          to="/tournaments"
          className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
        >
          ← Retour
        </Link>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  per,
  tagline,
  features,
  cta,
  loading,
  onClick,
  disabled,
  highlight,
  badge,
  footnote,
}: {
  name: string;
  price: string;
  per: string;
  tagline: string;
  features: string[];
  cta: string;
  loading: boolean;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  badge?: string;
  footnote?: string;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-[18px] border-2 bg-card p-6 transition-all ${
        highlight
          ? "border-emerald-500/40 shadow-2xl shadow-emerald-500/10 ring-1 ring-emerald-500/20"
          : "border-border shadow-sm"
      }`}
    >
      {badge && (
        <span
          className="absolute -top-3 right-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg"
          style={{
            background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
          }}
        >
          {badge}
        </span>
      )}
      <div className="flex items-center gap-2">
        {highlight ? (
          <Sparkles className="h-5 w-5 text-emerald-600" />
        ) : (
          <Trophy className="h-5 w-5 text-muted-foreground" />
        )}
        <h2 className="font-display text-lg font-bold">{name}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>

      <div className="mt-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold">{price}</span>
        </div>
        <p className="text-xs text-muted-foreground">{per}</p>
      </div>

      <ul className="mt-5 space-y-2 text-sm flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                highlight ? "text-emerald-600" : "text-primary"
              }`}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-6 h-11 relative overflow-hidden"
        disabled={loading || disabled}
        onClick={onClick}
        style={
          highlight
            ? {
                background: "linear-gradient(135deg, #1d7a45 0%, #2d9d5f 100%)",
                color: "white",
              }
            : undefined
        }
        variant={highlight ? "default" : "outline"}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
        {cta}
      </Button>

      {footnote && (
        <p className="mt-3 text-center text-xs font-medium text-emerald-700">{footnote}</p>
      )}
    </div>
  );
}
