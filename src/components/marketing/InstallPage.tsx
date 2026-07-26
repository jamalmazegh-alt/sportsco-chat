import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Smartphone, Bell, WifiOff, Share, SquarePlus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const BENEFIT_ICONS = [Bell, Smartphone, WifiOff];

export function InstallPage() {
  const { t } = useTranslation("marketing");

  const iosSteps = t("install.iosSteps", { returnObjects: true }) as string[];
  const androidSteps = t("install.androidSteps", { returnObjects: true }) as string[];
  const benefits = t("install.benefits", { returnObjects: true }) as string[];

  return (
    <MarketingLayout>
      {/* HERO */}
      <section className="border-b border-border/60 bg-gradient-to-b from-[color:var(--brand-blue-soft)]/40 to-background">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            {t("install.kicker")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t("install.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t("install.subtitle")}
          </p>
        </div>
      </section>

      {/* STEP-BY-STEP */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* iOS / Apple */}
            <div className="flex flex-col rounded-3xl border border-border bg-card p-7">
              <div className="flex items-center gap-2 text-[color:var(--brand-blue-deep)]">
                <Smartphone className="h-5 w-5" />
                <h2 className="font-display text-xl font-bold">{t("install.iosTitle")}</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t("install.iosLead")}</p>

              {/* glyph reminder of the two Safari buttons */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
                  <Share className="h-4 w-4" />
                  {t("install.iosShare")}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
                  <SquarePlus className="h-4 w-4" />
                  {t("install.iosAdd")}
                </span>
              </div>

              <ol className="mt-6 space-y-4">
                {iosSteps.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm leading-relaxed text-foreground/90">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Android */}
            <div className="flex flex-col rounded-3xl border border-border bg-card p-7">
              <div className="flex items-center gap-2 text-[color:var(--brand-blue-deep)]">
                <Smartphone className="h-5 w-5" />
                <h2 className="font-display text-xl font-bold">{t("install.androidTitle")}</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t("install.androidLead")}</p>

              <ol className="mt-6 space-y-4">
                {androidSteps.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm leading-relaxed text-foreground/90">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
            {t("install.note")}
          </p>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("install.benefitsTitle")}
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {benefits.map((item, i) => {
              const Icon = BENEFIT_ICONS[i] ?? Bell;
              return (
                <div key={item} className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-foreground/90">{item}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-4xl px-5 py-20 text-center lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("install.ctaTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{t("install.ctaBody")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/login">
                {t("install.ctaPrimary")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/contact">{t("install.ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
