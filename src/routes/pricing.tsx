import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Tarifs — Clubero" },
      {
        name: "description",
        content:
          "Une tarification simple, pensée pour les clubs. Commencez gratuitement, évoluez quand votre club grandit.",
      },
      { property: "og:title", content: "Tarifs — Clubero" },
      {
        property: "og:description",
        content: "Commencez gratuitement. Évoluez quand votre club grandit.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/pricing" }],
  }),
});

const TIERS = [
  {
    name: "Découverte",
    price: "Gratuit",
    cadence: "à vie",
    description: "Parfait pour une équipe qui essaie Clubero.",
    cta: "Commencer",
    href: "/register" as const,
    highlight: false,
    features: [
      "1 équipe",
      "Jusqu'à 25 membres",
      "Convocations & présences",
      "Application mobile pour tous les rôles",
      "Support par e-mail",
    ],
  },
  {
    name: "Club",
    price: "39 €",
    cadence: "par mois",
    description: "Pour les clubs avec plusieurs équipes.",
    cta: "Demander une démo",
    href: "/demo" as const,
    highlight: true,
    features: [
      "Équipes illimitées",
      "Membres illimités",
      "Mur de communication du club",
      "Statistiques et exports de présences",
      "Rôles & permissions personnalisés",
      "Support prioritaire",
    ],
  },
  {
    name: "Fédération",
    price: "Sur mesure",
    cadence: "personnalisé",
    description: "Multi-clubs, fédérations et académies.",
    cta: "Nous contacter",
    href: "/contact" as const,
    highlight: false,
    features: [
      "Organisation multi-clubs",
      "SSO et sécurité avancée",
      "Onboarding dédié",
      "Exports de données personnalisés",
      "SLA et formation",
    ],
  },
];

function PricingPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            Tarifs
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Une tarification simple pour chaque club.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Commencez gratuitement avec une équipe. Évoluez quand votre club grandit. Sans frais d&apos;installation.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="grid gap-6 lg:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative rounded-3xl border bg-card p-8 ${
                  t.highlight
                    ? "border-[color:var(--brand-blue)] shadow-xl shadow-[color:var(--brand-blue)]/10"
                    : "border-border"
                }`}
              >
                {t.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[color:var(--brand-blue-deep)] px-3 py-1 text-xs font-semibold text-white">
                    Le plus populaire
                  </div>
                )}
                <h2 className="font-display text-xl font-bold">{t.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-bold">{t.price}</span>
                  <span className="text-sm text-muted-foreground">{t.cadence}</span>
                </div>
                <Button
                  asChild
                  className="mt-6 w-full h-11"
                  variant={t.highlight ? "default" : "outline"}
                >
                  <Link to={t.href}>{t.cta}</Link>
                </Button>
                <ul className="mt-8 space-y-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            Toutes les offres incluent l&apos;hébergement européen, la conformité RGPD
            et les convocations illimitées.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
