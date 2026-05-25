import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Users,
  UserSquare2,
  Heart,
  ClipboardList,
  CalendarDays,
  Trophy,
  FileSpreadsheet,
  ImageIcon,
  Send,
  Sparkles,
  Settings2,
  CheckCircle2,
  LifeBuoy,
  HandHeart,
  Wand2,
  MessageCircle,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const IMPORT_ICONS = [
  Users,
  UserSquare2,
  Heart,
  Whistle,
  CalendarDays,
  Trophy,
  FileSpreadsheet,
  ImageIcon,
];

const STEP_ICONS = [Send, Sparkles, Settings2, CheckCircle2];

const HUMAN_ICONS = [LifeBuoy, HandHeart, Wand2, MessageCircle];

export function ClubOnboardingPage({ locale }: { locale: "fr" | "en" }) {
  const { t, i18n } = useTranslation("marketing");

  useEffect(() => {
    if (i18n.language?.slice(0, 2) !== locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale, i18n]);

  const imports = t("onboarding.imports", { returnObjects: true }) as { t: string; b: string }[];
  const steps = t("onboarding.steps", { returnObjects: true }) as { t: string; b: string }[];
  const humanPoints = t("onboarding.humanPoints", { returnObjects: true }) as { t: string; b: string }[];
  const faq = t("onboarding.faq", { returnObjects: true }) as { q: string; a: string }[];

  return (
    <MarketingLayout>
      {/* HERO */}
      <section className="border-b border-border/60 bg-gradient-to-b from-[color:var(--brand-blue-soft)]/40 to-background">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            {t("onboarding.kicker")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t("onboarding.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t("onboarding.subtitle")}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/demo">
                {t("onboarding.ctaDemo")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/contact">{t("onboarding.ctaContact")}</Link>
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              {t("onboarding.reassure1")}
            </li>
            <li className="flex items-center gap-1.5">
              <HandHeart className="h-3.5 w-3.5 text-primary" />
              {t("onboarding.reassure2")}
            </li>
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {t("onboarding.reassure3")}
            </li>
          </ul>
        </div>
      </section>

      {/* IMPORTS */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("onboarding.importTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("onboarding.importSubtitle")}</p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {imports.map((item, i) => {
              const Icon = IMPORT_ICONS[i] ?? Users;
              return (
                <div
                  key={item.t}
                  className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold">{item.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.b}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("onboarding.howTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("onboarding.howSubtitle")}</p>
          </div>

          <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => {
              const Icon = STEP_ICONS[i] ?? Send;
              return (
                <li
                  key={step.t}
                  className="relative rounded-3xl border border-border bg-card p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <Icon className="h-5 w-5 text-[color:var(--brand-blue-deep)]" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-semibold">{step.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.b}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* HUMAN SUPPORT */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("onboarding.humanTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("onboarding.humanSubtitle")}</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {humanPoints.map((point, i) => {
              const Icon = HUMAN_ICONS[i] ?? LifeBuoy;
              return (
                <div
                  key={point.t}
                  className="flex gap-4 rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-semibold">{point.t}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {point.b}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("onboarding.faqTitle")}
          </h2>
          <div className="mt-10 space-y-3">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-border bg-card p-5 open:shadow-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-base font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="mx-auto max-w-4xl px-5 py-20 text-center lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("onboarding.ctaTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{t("onboarding.ctaBody")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/demo">
                {t("onboarding.ctaPrimary")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/contact">{t("onboarding.ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
