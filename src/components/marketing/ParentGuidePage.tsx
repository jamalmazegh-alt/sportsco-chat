import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  UserPlus,
  ShieldCheck,
  CalendarCheck,
  Bell,
  CalendarX2,
  Car,
  Megaphone,
  CheckCircle2,
  Smartphone,
  HandHeart,
  ArrowRight,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

// One Lucide icon per tutorial, in the same order as the `parentGuide.tutorials`
// i18n array.
const TUTORIAL_ICONS = [
  UserPlus, // Ouvrir son compte parent
  ShieldCheck, // Consentement / accès à l'enfant
  CalendarCheck, // Voir les événements et répondre à une convocation
  Bell, // Paramétrer les notifications
  CalendarX2, // Déclarer une absence
  Car, // Covoiturage
  Megaphone, // Le Mur du club
];

// Screenshot slug per tutorial, in the same order as `parentGuide.tutorials`.
// Each step of a tutorial gets its OWN capture, named:
//   /images/parent-guide/{slug}-{stepNumber}.webp   (e.g. account-1.webp)
// Drop the files in public/images/parent-guide/ and the placeholders below
// can be swapped for <img src={`/images/parent-guide/${slug}-${s + 1}.webp`} />.
const TUTORIAL_SLUGS = [
  "account", // Ouvrir son compte parent
  "consent", // Consentement / accès à l'enfant
  "events", // Voir les événements et répondre à une convocation
  "notifications", // Paramétrer les notifications
  "absence", // Déclarer une absence
  "carpool", // Covoiturage
  "wall", // Le Mur du club
];

const REASSURE_ICONS = [Smartphone, Bell, ShieldCheck];

type Tutorial = { t: string; b: string; steps: string[] };

// Renders the real screenshot when the file exists in
// public/images/parent-guide/, and gracefully falls back to a placeholder
// while captures are still missing. Drop files named `{slug}-{step}.webp`.
function StepMedia({ src, step, label }: { src: string; step: number; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden bg-gradient-to-br from-[color:var(--brand-blue-soft)]/50 to-muted/30">
      {failed ? (
        <div className="flex flex-col items-center gap-1.5 text-[color:var(--brand-blue-deep)]/60">
          <ImageIcon className="h-8 w-8" />
          <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
        </div>
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      )}
      <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
        {step}
      </span>
    </div>
  );
}

export function ParentGuidePage({ locale }: { locale: "fr" | "en" }) {
  const { t, i18n } = useTranslation("marketing");
  const navigate = useNavigate();

  // Sync i18n with the route locale on mount; if the user switches language
  // afterwards, navigate to the counterpart route instead of forcing it back.
  useEffect(() => {
    const routeFor = (lng: string) => (lng === "fr" ? "/fr/guide-parents" : "/en/parent-guide");
    const current = i18n.language?.slice(0, 2);
    if (current && current !== locale) {
      navigate({ to: routeFor(current) });
      return;
    }
    if (current !== locale) {
      i18n.changeLanguage(locale);
    }
    const handler = (lng: string) => {
      const next = lng?.slice(0, 2);
      if (next && next !== locale) {
        navigate({ to: routeFor(next) });
      }
    };
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [locale, i18n, navigate]);

  const reassure = t("parentGuide.reassure", { returnObjects: true }) as string[];
  const tutorials = t("parentGuide.tutorials", { returnObjects: true }) as Tutorial[];
  const faq = t("parentGuide.faq", { returnObjects: true }) as { q: string; a: string }[];

  return (
    <MarketingLayout>
      {/* HERO */}
      <section className="border-b border-border/60 bg-gradient-to-b from-[color:var(--brand-blue-soft)]/40 to-background">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            {t("parentGuide.kicker")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t("parentGuide.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t("parentGuide.subtitle")}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <a href="#tutorials">
                {t("parentGuide.ctaStart")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/faq">{t("parentGuide.ctaFaq")}</Link>
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {reassure.map((item, i) => {
              const Icon = REASSURE_ICONS[i] ?? CheckCircle2;
              return (
                <li key={item} className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {item}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* TUTORIALS */}
      <section id="tutorials" className="scroll-mt-24 border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("parentGuide.tutorialsTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("parentGuide.tutorialsSubtitle")}</p>
          </div>

          <div className="mt-16 space-y-20">
            {tutorials.map((tuto, i) => {
              const Icon = TUTORIAL_ICONS[i] ?? CheckCircle2;
              const slug = TUTORIAL_SLUGS[i] ?? `tuto-${i + 1}`;
              return (
                <div key={tuto.t} id={`tuto-${i + 1}`} className="scroll-mt-24">
                  {/* Tutorial header */}
                  <div className="flex items-start gap-4 border-l-2 border-primary/40 pl-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 text-[color:var(--brand-blue-deep)]">
                        <Icon className="h-5 w-5" />
                        <h3 className="font-display text-xl font-bold sm:text-2xl">{tuto.t}</h3>
                      </div>
                      <p className="mt-2 max-w-2xl text-muted-foreground">{tuto.b}</p>
                    </div>
                  </div>

                  {/* One screenshot per step */}
                  <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {tuto.steps.map((step, s) => (
                      <li
                        key={step}
                        className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-sm"
                      >
                        <StepMedia
                          src={`/images/parent-guide/${slug}-${s + 1}.webp`}
                          step={s + 1}
                          label={t("parentGuide.previewLabel")}
                        />
                        <p className="flex-1 p-4 text-sm leading-relaxed text-foreground/90">
                          {step}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* DOWNLOAD THE APP */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-5 py-16 lg:px-8">
          <div className="flex flex-col items-center gap-6 rounded-3xl border border-border bg-gradient-to-br from-[color:var(--brand-blue-soft)]/40 to-card p-8 text-center sm:p-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Smartphone className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {t("parentGuide.download.title")}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                {t("parentGuide.download.body")}
              </p>
            </div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground/80">
              {t("parentGuide.download.iosHint")}
            </p>
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/install">
                {t("parentGuide.download.cta")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("parentGuide.faqTitle")}
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
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <HandHeart className="h-6 w-6" />
          </div>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("parentGuide.ctaTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{t("parentGuide.ctaBody")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/contact">
                {t("parentGuide.ctaPrimary")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/login">{t("parentGuide.ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
