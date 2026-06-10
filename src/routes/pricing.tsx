import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Check, Sparkles, Building2, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { trackConversion } from "@/lib/conversion-tracking";


export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    source: typeof search.source === "string" ? (search.source as string) : undefined,
    utm_source:
      typeof search.utm_source === "string" ? (search.utm_source as string) : undefined,
    tournament_id:
      typeof search.tournament_id === "string"
        ? (search.tournament_id as string)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: i18n.t("meta.pricing.title") },
      { name: "description", content: i18n.t("meta.pricing.description") },
      { property: "og:title", content: i18n.t("meta.pricing.title") },
      { property: "og:description", content: i18n.t("meta.pricing.ogDescription") },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/pricing" }],
  }),
});

function PricingPage() {
  const { t } = useTranslation("marketing");
  const { t: tc } = useTranslation("common");
  const search = Route.useSearch();
  const fromTournament =
    search.source === "tournament_conversion" ||
    (search.utm_source ?? "").includes("tournament");
  const clubBenefits = tc("pricing.clubBenefits", { returnObjects: true }) as string[];
  const CLUBERO_FEATURES = t("pricing.clubFeatures", { returnObjects: true }) as string[];
  const ENTERPRISE_FEATURES = t("pricing.enterpriseFeatures", { returnObjects: true }) as string[];

  useEffect(() => {
    if (fromTournament) {
      trackConversion("pricing_viewed", {
        source: search.source ?? search.utm_source ?? "tournament",
        tournament_id: search.tournament_id ?? null,
      });
    }
  }, [fromTournament, search.source, search.utm_source, search.tournament_id]);

  return (
    <MarketingLayout>
      {fromTournament && (
        <section className="border-b border-border/60 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10">
          <div className="mx-auto max-w-4xl px-5 py-10 lg:px-8 lg:py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
                <Trophy className="h-7 w-7" />
              </div>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                {tc("pricing.tournamentHero.title")}
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground">
                {tc("pricing.tournamentHero.subtitle")}
              </p>
              {Array.isArray(clubBenefits) && clubBenefits.length > 0 && (
                <ul className="mt-2 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-2">
                  {clubBenefits.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
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
        <div className="mx-auto max-w-6xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-3">
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
                  <span className="font-display text-5xl font-bold">49 €</span>
                  <span className="text-muted-foreground">{t("pricing.priceMonthly")}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pricing.monthlyAlt")}{" "}
                  <span className="font-semibold text-foreground">
                    490 € {t("pricing.priceYearly")}
                  </span>{" "}
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {t("pricing.yearlyDiscount")}
                  </span>
                </p>
              </div>

              <Button asChild className="mt-6 w-full h-11">
                <Link to="/register">{t("pricing.ctaStart")}</Link>
              </Button>

              <ul className="mt-8 grid grid-cols-1 gap-2.5">
                {CLUBERO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tournaments-only Plan */}
            <div className="flex flex-col rounded-3xl border border-border bg-card p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                  <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">{t("tournaments.pricing.title")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("tournaments.pricing.subtitle")}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl font-bold">40 €</span>
                  <span className="text-muted-foreground">{t("tournaments.pricing.per")}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("tournaments.pricing.info")}
                </p>
              </div>

              <Button asChild className="mt-6 w-full h-11">
                <Link to="/tournaments/start">{t("tournaments.pricing.cta")}</Link>
              </Button>

              <ul className="mt-8 grid grid-cols-1 gap-2.5">
                {[
                  t("tournaments.pricing.feat1"),
                  t("tournaments.pricing.feat2"),
                  t("tournaments.pricing.feat3"),
                  t("tournaments.pricing.feat4"),
                  t("tournaments.pricing.feat5"),
                  t("tournaments.pricing.feat6"),
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
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
                {ENTERPRISE_FEATURES.map((f) => (

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
