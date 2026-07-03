import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { CheckCircle2, ArrowRight, Megaphone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  TournamentsSection,
  CoachAssistSection,
  WhatsAppHybrid,
  ClubWallSection,
  PlayerJournalSection,
} from "./index";

export const Route = createFileRoute("/features")({
  component: FeaturesPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.features.title") },
      { name: "description", content: i18n.t("meta.features.description") },
      { property: "og:title", content: i18n.t("meta.features.title") },
      { property: "og:description", content: i18n.t("meta.features.ogDescription") },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/features" }],
  }),
});

const SPORTS = [
  "Football",
  "Futsal",
  "Basketball",
  "Rugby",
  "Handball",
  "Volleyball",
  "Ice hockey",
  "Field hockey",
];
const AUDIENCE_COLORS = [
  "var(--brand-blue-deep)",
  "var(--brand-blue)",
  "var(--secondary)",
  "var(--primary)",
];

function Anchor({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20">
      {children}
    </div>
  );
}

function SponsorsFeatureSection() {
  const { t } = useTranslation("marketing");
  const bullets = [
    t("features.sponsors.b1"),
    t("features.sponsors.b2"),
    t("features.sponsors.b3"),
  ];
  return (
    <section className="border-b border-border/60 bg-muted/20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-2 lg:items-center lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            {t("features.sponsors.kicker")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("features.sponsors.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("features.sponsors.body")}</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-foreground/80">{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/pricing">
                {t("features.sponsors.cta")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Megaphone className="h-4 w-4 text-primary" />
              {t("features.sponsors.kicker")}
            </div>
            <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-background/60 px-6 py-8 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("features.sponsors.kicker")}
              </span>
              <span className="text-lg font-bold text-foreground">Your Partner</span>
              <span className="text-xs text-muted-foreground">clubero.app</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesPage() {

  const { t } = useTranslation("marketing");
  const audiences = t("features.audiences", { returnObjects: true }) as {
    t: string;
    p: string[];
  }[];

  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            {t("features.kicker")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t("features.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t("features.subtitle")}
          </p>
        </div>
      </section>

      <Anchor id="tournaments">
        <TournamentsSection />
      </Anchor>
      <Anchor id="coach-ai">
        <CoachAssistSection />
      </Anchor>
      <Anchor id="wall">
        <ClubWallSection />
      </Anchor>
      <Anchor id="whatsapp">
        <WhatsAppHybrid />
      </Anchor>
      <Anchor id="player">
        <PlayerJournalSection />
      </Anchor>
      <Anchor id="sponsors">
        <SponsorsFeatureSection />
      </Anchor>
      <Anchor id="future">
        <FutureFeaturesSection />
      </Anchor>


      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("features.sportsTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("features.sportsBody")}</p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            {SPORTS.map((s) => (
              <span
                key={s}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground/80"
              >
                {s}
              </span>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("features.sportsAskPre")}
            <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
              {t("features.sportsAskLink")}
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("features.rolesTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("features.rolesBody")}</p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {audiences.map((a, i) => (
              <div key={a.t} className="rounded-3xl border border-border bg-card p-8">
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: AUDIENCE_COLORS[i] }}
                  />
                  <h3 className="font-display text-2xl font-bold">{a.t}</h3>
                </div>
                <ul className="mt-6 space-y-3">
                  {a.p.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-16 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/demo">
                {t("features.ctaDemo")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/pricing">{t("features.ctaPricing")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
