import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  CheckCircle2,
  ArrowRight,
  Megaphone,
  Clock,
  Trophy,
  CalendarCheck2,
  Users,
  Sun,
  MessageCircle,
  Settings2,
  CreditCard,
  Sparkles,
  Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  TournamentsSection,
  CoachAssistSection,
  WhatsAppHybrid,
  ClubWallSection,
  PlayerJournalSection,
  ChallengesVisual,
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
    links: [{ rel: "canonical", href: "https://clubero.app/features" }],
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

function ChallengesFeatureSection() {
  const { t } = useTranslation("marketing");
  const bullets = [
    t("features.challenges.b1"),
    t("features.challenges.b2"),
    t("features.challenges.b3"),
    t("features.challenges.b4"),
  ];
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:items-center lg:px-8">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600">
            <Trophy className="h-3.5 w-3.5" />
            {t("features.challenges.kicker")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("features.challenges.title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("features.challenges.body")}</p>
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
              <Link to="/demo">
                {t("features.challenges.cta")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex justify-center">
          <ChallengesVisual />
        </div>
      </div>
    </section>
  );
}

function SponsorsFeatureSection() {
  const { t } = useTranslation("marketing");
  const bullets = [t("features.sponsors.b1"), t("features.sponsors.b2"), t("features.sponsors.b3")];
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
              <span className="text-lg font-bold text-foreground">
                {t("features.sponsors.demoName")}
              </span>
              <span className="text-xs text-muted-foreground">clubero.app</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FutureFeaturesSection() {
  const { t } = useTranslation("marketing");
  const items = [t("features.future.i1"), t("features.future.i2"), t("features.future.i3")];
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-4xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="rounded-3xl border border-dashed border-border bg-muted/20 p-8 sm:p-10">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <Clock className="h-3 w-3" />
            {t("features.future.badge")}
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {t("features.future.title")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("features.future.body")}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {items.map((it) => (
              <li
                key={it}
                className="rounded-2xl border border-border bg-card p-4 text-sm font-medium text-foreground/80"
              >
                {it}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

type ModuleVisual = {
  icon: LucideIcon;
  accent: string; // tailwind color class base, e.g. "sky", "amber"
  featured?: boolean;
};

const MODULE_VISUALS: Record<string, ModuleVisual> = {
  coordination: { icon: CalendarCheck2, accent: "sky" },
  effectif: { icon: Users, accent: "emerald" },
  tournois: { icon: Trophy, accent: "amber", featured: true },
  stages: { icon: Sun, accent: "orange" },
  communication: { icon: MessageCircle, accent: "violet" },
  admin: { icon: Settings2, accent: "slate" },
  paiements: { icon: CreditCard, accent: "rose" },
  ia: { icon: Sparkles, accent: "fuchsia", featured: true },
  soon: { icon: Rocket, accent: "indigo" },
};

const ACCENT_CLASSES: Record<
  string,
  { chip: string; ring: string; glow: string; icon: string; dot: string }
> = {
  sky: {
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    ring: "hover:border-sky-500/40",
    glow: "from-sky-500/20 via-sky-500/5 to-transparent",
    icon: "text-sky-600 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  emerald: {
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    ring: "hover:border-emerald-500/40",
    glow: "from-emerald-500/20 via-emerald-500/5 to-transparent",
    icon: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  amber: {
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    ring: "hover:border-amber-500/40",
    glow: "from-amber-500/25 via-amber-500/5 to-transparent",
    icon: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  orange: {
    chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    ring: "hover:border-orange-500/40",
    glow: "from-orange-500/20 via-orange-500/5 to-transparent",
    icon: "text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  violet: {
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    ring: "hover:border-violet-500/40",
    glow: "from-violet-500/20 via-violet-500/5 to-transparent",
    icon: "text-violet-600 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  slate: {
    chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    ring: "hover:border-slate-500/40",
    glow: "from-slate-500/15 via-slate-500/5 to-transparent",
    icon: "text-slate-600 dark:text-slate-300",
    dot: "bg-slate-500",
  },
  rose: {
    chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    ring: "hover:border-rose-500/40",
    glow: "from-rose-500/20 via-rose-500/5 to-transparent",
    icon: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  fuchsia: {
    chip: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
    ring: "hover:border-fuchsia-500/40",
    glow: "from-fuchsia-500/25 via-fuchsia-500/5 to-transparent",
    icon: "text-fuchsia-600 dark:text-fuchsia-400",
    dot: "bg-fuchsia-500",
  },
  indigo: {
    chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    ring: "hover:border-indigo-500/40",
    glow: "from-indigo-500/20 via-indigo-500/5 to-transparent",
    icon: "text-indigo-600 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
};

// Modules with a dedicated deep-dive section further down the page.
// `excludedIndices` removes items already covered in that section to avoid
// duplication. Everything else stays in the bento grid.
const MODULE_DEEP_DIVE: Record<string, { anchor: string; excludedIndices: number[] }> = {
  effectif: { anchor: "#player", excludedIndices: [2] },
  tournois: { anchor: "#tournaments", excludedIndices: [0, 2, 3, 6] },
  communication: { anchor: "#wall", excludedIndices: [0, 3, 4] },
  ia: { anchor: "#coach-ai", excludedIndices: [0] },
};

function moduleHref(keyName: string) {
  return MODULE_DEEP_DIVE[keyName]?.anchor ?? `#module-${keyName}`;
}

function ModuleNavPill({ keyName, label }: { keyName: string; label: string }) {
  const vis = MODULE_VISUALS[keyName];
  const cls = ACCENT_CLASSES[vis.accent];
  const Icon = vis.icon;
  return (
    <a
      href={moduleHref(keyName)}
      className={`group inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground/80 transition hover:-translate-y-0.5 hover:shadow-sm ${cls.ring}`}
    >
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${cls.chip}`}>
        <Icon className={`h-3 w-3 ${cls.icon}`} />
      </span>
      {label}
    </a>
  );
}

function ModuleBlock({
  keyName,
  mod,
}: {
  keyName: string;
  mod: {
    title: string;
    subtitle: string;
    badge?: string;
    items: { title: string; body: string; badge?: string }[];
  };
}) {
  const { t } = useTranslation("marketing");
  const vis = MODULE_VISUALS[keyName];
  const cls = ACCENT_CLASSES[vis.accent];
  const Icon = vis.icon;
  const deepDive = MODULE_DEEP_DIVE[keyName];
  const excluded = new Set(deepDive?.excludedIndices ?? []);
  const items = mod.items.filter((_, i) => !excluded.has(i));
  // Only keep the hero layout for featured modules that DON'T have a deep-dive
  // (otherwise the "En savoir plus" CTA in the header is the real hero).
  const featured = !!vis.featured && !deepDive;

  return (
    <div id={`module-${keyName}`} className="scroll-mt-20">
      {/* Header band */}
      <div
        className={`relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8`}
      >
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${cls.glow} opacity-70`}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <div
            className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${cls.chip}`}
          >
            <Icon className={`h-6 w-6 ${cls.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {mod.title}
              </h2>
              {mod.badge && (
                <Badge
                  variant="secondary"
                  className={`uppercase tracking-wide ${cls.chip} border-transparent`}
                >
                  {mod.badge}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">{mod.subtitle}</p>
          </div>
          {deepDive ? (
            <a
              href={deepDive.anchor}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3.5 py-1.5 text-xs font-semibold text-foreground/80 transition hover:-translate-y-0.5 hover:shadow-sm ${cls.ring}`}
            >
              {t("features.learnMore")}
              <ArrowRight className={`h-3.5 w-3.5 ${cls.icon}`} />
            </a>
          ) : (
            <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              {items.length} {t("features.modulesCount")}
            </span>
          )}
        </div>
      </div>

      {/* Items — bento grid */}
      {items.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, idx) => {
            const isHero = featured && idx === 0;
            return (
              <div
                key={item.title}
                className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-md ${cls.ring} ${
                  isHero ? "sm:col-span-2 lg:row-span-2" : ""
                }`}
              >
                <span
                  className={`absolute left-0 top-0 h-full w-[3px] ${cls.dot} opacity-0 transition group-hover:opacity-100`}
                  aria-hidden
                />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${cls.dot}`} />
                    <h3 className={`font-display font-bold ${isHero ? "text-xl" : "text-base"}`}>
                      {item.title}
                    </h3>
                  </div>
                  {item.badge && (
                    <Badge
                      variant="secondary"
                      className={`shrink-0 text-[10px] uppercase tracking-wide ${cls.chip} border-transparent`}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </div>
                <p
                  className={`mt-2 leading-relaxed text-muted-foreground ${
                    isHero ? "text-base" : "text-sm"
                  }`}
                >
                  {item.body}
                </p>
                {isHero && (
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-foreground/70">
                    <CheckCircle2 className={`h-3.5 w-3.5 ${cls.icon}`} />
                    {t("features.includedV1")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModulesGridSection() {
  const { t } = useTranslation("marketing");
  const moduleKeys = [
    "coordination",
    "effectif",
    "tournois",
    "stages",
    "communication",
    "admin",
    "paiements",
    "ia",
    "soon",
  ] as const;

  return (
    <section className="border-b border-border/60 bg-gradient-to-b from-muted/30 via-background to-muted/10">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        {/* Quick nav */}
        <div className="mb-14 flex flex-wrap justify-center gap-2">
          {moduleKeys.map((key) => {
            const mod = t(`features.modules.${key}`, { returnObjects: true }) as {
              title: string;
            };
            return <ModuleNavPill key={key} keyName={key} label={mod.title} />;
          })}
        </div>

        <div className="space-y-20">
          {moduleKeys.map((key) => {
            const mod = t(`features.modules.${key}`, { returnObjects: true }) as {
              title: string;
              subtitle: string;
              badge?: string;
              items: { title: string; body: string; badge?: string }[];
            };
            return <ModuleBlock key={key} keyName={key} mod={mod} />;
          })}
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

      <Anchor id="modules">
        <ModulesGridSection />
      </Anchor>
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
      <Anchor id="challenges">
        <ChallengesFeatureSection />
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
