import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Sparkles, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
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
          "Essai gratuit de 30 jours. Puis 39€/mois pour un accès illimité. Entreprise sur mesure.",
      },
      { property: "og:title", content: "Tarifs — Clubero" },
      {
        property: "og:description",
        content: "30 jours gratuits. 39€/mois ensuite. Tout inclus.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/pricing" }],
  }),
});

const CLUBERO_FEATURES = [
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

function PricingPage() {
  const { t } = useTranslation("marketing");

  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("pricing.badge")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t("pricing.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t("pricing.subtitle")}
          </p>
        </div>
      </section>

      {/* Free Trial Banner */}
      <section className="border-b border-border/60 bg-primary/5">
        <div className="mx-auto max-w-4xl px-5 py-10 text-center lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            {t("pricing.trialBadge")}
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">
            {t("pricing.trialTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {t("pricing.trialBody")}
          </p>
          <Button asChild className="mt-6 h-11 px-8">
            <Link to="/register">{t("pricing.trialCta")}</Link>
          </Button>
        </div>
      </section>

      {/* Main Pricing */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* CLUBERO Plan */}
            <div className="relative rounded-3xl border border-primary bg-card p-8 shadow-xl shadow-primary/5">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                {t("pricing.popular")}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">{t("pricing.planName")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("pricing.planSubtitle")}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl font-bold">39 €</span>
                  <span className="text-muted-foreground">{t("pricing.priceMonthly")}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pricing.monthlyAlt")}{" "}
                  <span className="font-semibold text-foreground">
                    390 € {t("pricing.priceYearly")}
                  </span>{" "}
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {t("pricing.yearlyDiscount")}
                  </span>
                </p>
              </div>

              <Button asChild className="mt-6 w-full h-11">
                <Link to="/register">{t("pricing.ctaStart")}</Link>
              </Button>

              <ul className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {CLUBERO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Enterprise */}
            <div className="flex flex-col rounded-3xl border border-border bg-card p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">{t("pricing.enterpriseName")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("pricing.enterpriseSubtitle")}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div className="font-display text-5xl font-bold">
                  {t("pricing.enterprisePrice")}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pricing.enterpriseBody")}
                </p>
              </div>

              <Button asChild variant="outline" className="mt-6 w-full h-11">
                <Link to="/contact">{t("pricing.enterpriseCta")}</Link>
              </Button>

              <ul className="mt-8 space-y-3">
                {[
                  "Multi-clubs, fédérations & districts",
                  "Académies et centres de formation",
                  "Ligues et organisations sportives",
                  "SSO et sécurité avancée",
                  "Onboarding dédié",
                  "Exports de données personnalisés",
                  "SLA et formation",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            {t("pricing.footer")}
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
