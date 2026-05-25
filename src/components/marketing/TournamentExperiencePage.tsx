import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Users,
  LayoutGrid,
  Swords,
  Trophy,
  CalendarRange,
  Flag,
  Globe2,
  Tv,
  Radio,
  Smartphone,
  CheckCircle2,
  QrCode,
  Zap,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  MapPin,
  Wand2,
  ScanLine,
  Eye,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { cn } from "@/lib/utils";

const ECOSYSTEM_ICONS = [
  Users,
  LayoutGrid,
  Swords,
  Trophy,
  CalendarRange,
  Flag,
  Globe2,
  Tv,
  Radio,
];

const LIVE_ICONS = [Smartphone, ShieldCheck, Zap, MapPin, CalendarRange, Eye, QrCode];
const PUBLIC_ICONS = [Trophy, Swords, Radio, Users, Smartphone, Share2];
const MOBILE_ICONS = [Smartphone, MapPin, ScanLine, Zap, Radio];
const FORMAT_ICONS = [LayoutGrid, Swords, Users, Trophy, Wand2];

type Item = { t: string; b: string };
type Format = { t: string; b: string };
type PricingTier = {
  name: string;
  price: string;
  per: string;
  desc: string;
  cta: string;
  highlight?: boolean;
};

export function TournamentExperiencePage({ locale }: { locale: "fr" | "en" }) {
  const { t, i18n } = useTranslation("marketing");

  useEffect(() => {
    if (i18n.language?.slice(0, 2) !== locale) {
      i18n.changeLanguage(locale);
    }
  }, [locale, i18n]);

  const ecosystem = t("tournamentsPage.ecosystem", { returnObjects: true }) as Item[];
  const livePoints = t("tournamentsPage.livePoints", { returnObjects: true }) as Item[];
  const publicPoints = t("tournamentsPage.publicPoints", { returnObjects: true }) as Item[];
  const tvPoints = t("tournamentsPage.tvPoints", { returnObjects: true }) as string[];
  const formats = t("tournamentsPage.formats", { returnObjects: true }) as Format[];
  const formatsExtras = t("tournamentsPage.formatsExtras", { returnObjects: true }) as string[];
  const mobilePoints = t("tournamentsPage.mobilePoints", { returnObjects: true }) as Item[];
  const pricing = t("tournamentsPage.pricing", { returnObjects: true }) as PricingTier[];

  return (
    <MarketingLayout>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-[color:var(--brand-blue-soft)]/40 via-background to-background">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-[color:var(--brand-blue)]/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
              <Sparkles className="h-3.5 w-3.5" />
              {t("tournamentsPage.kicker")}
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              {t("tournamentsPage.title")}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              {t("tournamentsPage.subtitle")}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 px-6">
                <Link to="/tournaments/start">
                  {t("tournamentsPage.ctaPrimary")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6">
                <Link to="/demo">{t("tournamentsPage.ctaSecondary")}</Link>
              </Button>
            </div>
          </div>

          {/* Hero visual collage */}
          <div className="relative">
            <div className="relative grid grid-cols-6 gap-3 sm:gap-4">
              {/* Live match card */}
              <div className="col-span-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-600">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-600" />
                    </span>
                    {t("tournamentsPage.heroBadge")}
                  </span>
                  <span className="text-muted-foreground">{t("tournamentsPage.heroMatch")}</span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="text-right">
                    <p className="font-display text-sm font-semibold">{t("tournamentsPage.heroTeamA")}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-1.5 font-display text-2xl font-bold tabular-nums">
                    <span>2</span>
                    <span className="text-muted-foreground">·</span>
                    <span>1</span>
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold">{t("tournamentsPage.heroTeamB")}</p>
                  </div>
                </div>
              </div>

              {/* TV mode tile */}
              <div className="col-span-6 rounded-2xl border border-border bg-gradient-to-br from-[color:var(--brand-blue-deep)] to-[color:var(--brand-blue)] p-4 text-white shadow-sm sm:col-span-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                  <Tv className="h-3.5 w-3.5" />
                  {t("tournamentsPage.heroTv")}
                </div>
                <p className="mt-3 font-display text-2xl font-bold leading-none">16:9</p>
                <p className="mt-1 text-xs opacity-80">{t("tournamentsPage.tvBadge")}</p>
              </div>

              {/* Standings */}
              <div className="col-span-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-3">
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("tournamentsPage.heroStandings")}
                </p>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {[
                    { n: 1, name: t("tournamentsPage.heroTeamA"), pts: 9 },
                    { n: 2, name: t("tournamentsPage.heroTeamB"), pts: 6 },
                    { n: 3, name: "FC Eastside", pts: 3 },
                    { n: 4, name: "Northwood AC", pts: 1 },
                  ].map((row) => (
                    <li
                      key={row.n}
                      className={cn(
                        "flex items-center justify-between rounded-md px-2 py-1.5",
                        row.n === 1 && "bg-primary/10",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                          {row.n}
                        </span>
                        <span className="font-medium">{row.name}</span>
                      </span>
                      <span className="font-bold tabular-nums">{row.pts}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bracket mini */}
              <div className="col-span-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-3">
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("tournamentsPage.heroBracket")}
                </p>
                <div className="mt-3 grid grid-cols-3 items-center gap-2 text-[11px]">
                  <div className="space-y-1.5">
                    {["Team A", "Team B", "Team C", "Team D"].map((nm) => (
                      <div key={nm} className="rounded-md border border-border px-2 py-1 font-medium">
                        {nm}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-6">
                    <div className="rounded-md border border-primary/50 bg-primary/5 px-2 py-1 font-semibold text-primary">
                      Team A
                    </div>
                    <div className="rounded-md border border-border px-2 py-1 font-medium">Team D</div>
                  </div>
                  <div className="flex h-full items-center">
                    <div className="w-full rounded-md border border-primary bg-primary px-2 py-1 text-center font-semibold text-primary-foreground">
                      🏆
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ECOSYSTEM */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("tournamentsPage.everythingTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("tournamentsPage.everythingSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ecosystem.map((item, i) => {
              const Icon = ECOSYSTEM_ICONS[i] ?? Trophy;
              return (
                <div
                  key={item.t}
                  className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)] transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
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

      {/* LIVE */}
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-600">
              <Radio className="h-3.5 w-3.5" />
              Live
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("tournamentsPage.liveTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("tournamentsPage.liveSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {livePoints.map((item, i) => {
              const Icon = LIVE_ICONS[i] ?? Zap;
              return (
                <div key={item.t} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="font-display text-base font-semibold">{item.t}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.b}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PUBLIC EXPERIENCE */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
                Public
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {t("tournamentsPage.publicTitle")}
              </h2>
              <p className="mt-4 text-muted-foreground">{t("tournamentsPage.publicSubtitle")}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {publicPoints.map((item, i) => {
                  const Icon = PUBLIC_ICONS[i] ?? Trophy;
                  return (
                    <div
                      key={item.t}
                      className="flex gap-3 rounded-xl border border-border bg-card p-4"
                    >
                      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-primary" />
                      <div>
                        <p className="font-display text-sm font-semibold">{item.t}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {item.b}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile public mockup */}
            <div className="relative mx-auto w-full max-w-xs">
              <div className="rounded-[2.5rem] border-[10px] border-foreground/90 bg-background p-4 shadow-2xl">
                <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                  <span>9:41</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    Live
                  </span>
                </div>
                <div className="mt-3 rounded-xl bg-gradient-to-br from-[color:var(--brand-blue-deep)] to-[color:var(--brand-blue)] p-3 text-white">
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
                    Easter Cup · U13
                  </p>
                  <p className="mt-1 font-display text-base font-bold">Group A</p>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {[
                    { n: 1, name: "Riverside FC", pts: 9 },
                    { n: 2, name: "Lakeside FC", pts: 6 },
                    { n: 3, name: "FC Eastside", pts: 3 },
                    { n: 4, name: "Northwood", pts: 1 },
                  ].map((row) => (
                    <li
                      key={row.n}
                      className="flex items-center justify-between rounded-md bg-muted/60 px-2 py-1.5"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-bold text-muted-foreground">{row.n}</span>
                        <span className="font-medium">{row.name}</span>
                      </span>
                      <span className="font-bold tabular-nums">{row.pts}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-xl border border-border p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Next
                  </p>
                  <p className="mt-1 text-xs font-medium">Riverside vs Lakeside · 14:30</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TV MODE */}
      <section className="border-b border-border/60 bg-foreground text-background">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider opacity-90">
                <Tv className="h-3.5 w-3.5" />
                {t("tournamentsPage.heroTv")}
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {t("tournamentsPage.tvTitle")}
              </h2>
              <p className="mt-4 text-background/70">{t("tournamentsPage.tvSubtitle")}</p>
              <ul className="mt-8 space-y-2.5">
                {tvPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-blue)]" />
                    <span className="text-background/85">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* TV mockup */}
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[color:var(--brand-blue-deep)] to-black p-6 shadow-2xl">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-white/60">
                <span>Easter Cup · U13</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  LIVE
                </span>
              </div>

              <div className="mt-5 rounded-xl bg-white/5 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                  {t("tournamentsPage.tvCurrent")}
                </p>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-white">
                  <p className="text-right font-display text-lg font-bold">Riverside</p>
                  <p className="rounded-md bg-white/10 px-3 py-1 font-display text-2xl font-bold tabular-nums">
                    2 · 1
                  </p>
                  <p className="font-display text-lg font-bold">Lakeside</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-white/5 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                    {t("tournamentsPage.heroStandings")}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-white">
                    {[
                      { n: 1, name: "Riverside", pts: 9 },
                      { n: 2, name: "Lakeside", pts: 6 },
                      { n: 3, name: "Eastside", pts: 3 },
                    ].map((row) => (
                      <li key={row.n} className="flex items-center justify-between">
                        <span className="opacity-90">
                          {row.n}. {row.name}
                        </span>
                        <span className="font-bold tabular-nums">{row.pts}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl bg-white/5 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
                    {t("tournamentsPage.tvNext")}
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs text-white">
                    <li>14:30 · Eastside vs Northwood</li>
                    <li>15:00 · Riverside vs Lakeside</li>
                    <li>15:30 · Semi-final 1</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FORMATS */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("tournamentsPage.formatsTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("tournamentsPage.formatsSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {formats.map((f, i) => {
              const Icon = FORMAT_ICONS[i] ?? LayoutGrid;
              return (
                <div
                  key={f.t}
                  className="rounded-2xl border border-border bg-card p-5 text-center"
                >
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-sm font-semibold">{f.t}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.b}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2.5">
            {formatsExtras.map((extra) => (
              <span
                key={extra}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground/80"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                {extra}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* MOBILE FIRST */}
      <section className="border-b border-border/60 bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <Smartphone className="h-3.5 w-3.5" />
              Mobile first
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("tournamentsPage.mobileTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("tournamentsPage.mobileSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {mobilePoints.map((item, i) => {
              const Icon = MOBILE_ICONS[i] ?? Smartphone;
              return (
                <div key={item.t} className="rounded-2xl border border-border bg-card p-5">
                  <Icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-4 font-display text-sm font-semibold">{item.t}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.b}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {t("tournamentsPage.pricingTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("tournamentsPage.pricingSubtitle")}</p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pricing.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "relative flex flex-col rounded-3xl border bg-card p-7",
                  tier.highlight
                    ? "border-primary shadow-lg ring-1 ring-primary/30"
                    : "border-border",
                )}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    ★
                  </span>
                )}
                <h3 className="font-display text-lg font-semibold">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-display text-4xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.per}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{tier.desc}</p>
                <Button
                  asChild
                  size="lg"
                  variant={tier.highlight ? "default" : "outline"}
                  className="mt-6 h-11"
                >
                  <Link to={tier.highlight ? "/pricing" : "/tournaments/start"}>
                    {tier.cta}
                  </Link>
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t("tournamentsPage.pricingNote")}
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-gradient-to-br from-[color:var(--brand-blue-deep)] to-[color:var(--brand-blue)] text-white">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("tournamentsPage.finalTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/80">
            {t("tournamentsPage.finalBody")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="h-12 bg-white px-6 text-foreground hover:bg-white/90"
            >
              <Link to="/tournaments/start">
                {t("tournamentsPage.finalPrimary")} <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-white/30 bg-white/10 px-6 text-white hover:bg-white/20 hover:text-white"
            >
              <Link to="/demo">{t("tournamentsPage.finalSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
