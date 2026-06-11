import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { isAppHost } from "@/lib/host";
import {
  Loader2, ArrowRight, CalendarCheck, Users, Bell, ShieldCheck,
  MessageSquareText, BarChart3, CheckCircle2, Trophy, Zap, Activity, Flame, MessageCircle, Sparkles, BrainCircuit, Send,
  BookOpen, Share2, UploadCloud, FileText, Swords,
  Camera, Hash, Heart, Pin, TrendingUp, Star, ClipboardList, Bot, ListChecks,
  Shield, GraduationCap, Award, UserPlus, Plus, Building2, UserCircle2, Network, Newspaper,
  XCircle, Quote, Clock, Calendar, Mail, Smartphone, Layers, Radio, FileSpreadsheet, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: i18n.t("meta.publicHome.title") },
      { name: "description", content: i18n.t("meta.publicHome.description") },
      { property: "og:title", content: i18n.t("meta.publicHome.title") },
      { property: "og:description", content: i18n.t("meta.publicHome.ogDescription") },
      { property: "og:url", content: "https://clubero.app/" },
    ],
    links: [{ rel: "canonical", href: "https://clubero.app/" }],
  }),
});

function Index() {
  const [appHost, setAppHost] = useState<boolean | null>(null);

  useEffect(() => {
    setAppHost(isAppHost());
  }, []);

  if (appHost === null) {
    return <Landing />;
  }
  if (appHost) return <AppHostRedirect />;
  return <Landing />;
}

function AppHostRedirect() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <Navigate to={session ? "/home" : "/login"} replace />;
}

function Landing() {
  return (
    <MarketingLayout>
      <HeroDual />
      <DigitalizedFeatures />
      <AISection />
      <TournamentsStrip />
      <SocialNetworkSection />
      <FinalCTA />
    </MarketingLayout>
  );
}

// ============================================================
//  HOME — Identité Clubero (emerald + navy, semantic tokens)
// ============================================================

function HeroDual() {
  const { t } = useTranslation("marketing");
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-[140px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-5 pt-20 pb-16 lg:px-8 lg:pt-28 lg:pb-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t("home.hero.kicker", { defaultValue: "Pensée par et pour les clubs amateurs" })}
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t("home.hero.headline1", { defaultValue: "On a compris ce dont vous aviez besoin" })}{" "}
            <span className="text-primary">
              {t("home.hero.headline2", { defaultValue: "pour gagner du temps" })}
            </span>{" "}
            {t("home.hero.headline3", { defaultValue: "et vous reconcentrer sur le sport." })}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            {t("home.hero.sub", {
              defaultValue:
                "On a digitalisé tout ce qui fait perdre vos soirées : convocations, paiements, tournois, communication. Vous coachez, on s'occupe du reste.",
            })}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/register">
                {t("home.hero.cta", { defaultValue: "Essayer gratuitement" })}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/features">{t("home.hero.ctaSecondary", { defaultValue: "Voir les fonctionnalités" })}</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />{t("home.hero.trust1", { defaultValue: "Essai gratuit" })}</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />{t("home.hero.trust2", { defaultValue: "Sans carte bancaire" })}</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />{t("home.hero.trust3", { defaultValue: "Données hébergées en Europe" })}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function DigitalizedFeatures() {
  const { t } = useTranslation("marketing");
  const features = [
    {
      icon: CalendarCheck,
      title: t("home.digit.f1Title", { defaultValue: "Convocations en 12 secondes" }),
      body: t("home.digit.f1Body", { defaultValue: "Envoyez, relancez, suivez les réponses. Sans relancer chacun par SMS." }),
    },
    {
      icon: Sparkles,
      title: t("home.digit.f2Title", { defaultValue: "Paiements en ligne" }),
      body: t("home.digit.f2Body", { defaultValue: "Cotisations, équipements, stages. Stripe intégré, reçus automatiques, relances incluses." }),
    },
    {
      icon: MessageSquareText,
      title: t("home.digit.f3Title", { defaultValue: "Communication centralisée" }),
      body: t("home.digit.f3Body", { defaultValue: "Wall du club, chat d'événement, emails multilingues. Fini les groupes WhatsApp qui débordent." }),
    },
    {
      icon: BarChart3,
      title: t("home.digit.f4Title", { defaultValue: "Stats & suivi joueurs" }),
      body: t("home.digit.f4Body", { defaultValue: "Présences, feedback coach, progression. Une vraie carrière pour vos joueurs." }),
    },
    {
      icon: ShieldCheck,
      title: t("home.digit.f5Title", { defaultValue: "Disciplines & suspensions" }),
      body: t("home.digit.f5Body", { defaultValue: "Cartons, suspensions, blessures suivis automatiquement par équipe et par saison." }),
    },
    {
      icon: ClipboardList,
      title: t("home.digit.f6Title", { defaultValue: "Compositions & feuilles de match" }),
      body: t("home.digit.f6Body", { defaultValue: "Préparez la compo, partagez-la, exportez la feuille. Le coach a tout sur son téléphone." }),
    },
  ];
  return (
    <section className="border-b border-border/60 bg-muted/30 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("home.digit.kicker", { defaultValue: "On l'a digitalisé pour vous" })}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("home.digit.title", { defaultValue: "Tout ce qui vous prenait des heures, maintenant en quelques clics." })}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t("home.digit.sub", {
              defaultValue:
                "Chaque fonctionnalité répond à un vrai problème de bénévole : moins de tableurs, moins de messages, plus de terrain.",
            })}
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-3xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AISection() {
  const { t } = useTranslation("marketing");
  const bullets = [
    t("home.ai.b1", { defaultValue: "Résume vos matchs et propose la prochaine compo" }),
    t("home.ai.b2", { defaultValue: "Rédige vos communications en un clic, dans 7 langues" }),
    t("home.ai.b3", { defaultValue: "Détecte automatiquement les progrès et alertes joueurs" }),
    t("home.ai.b4", { defaultValue: "Assistant intégré : posez-lui une question sur votre club" }),
  ];
  return (
    <section className="border-b border-border/60 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <BrainCircuit className="h-3.5 w-3.5" />
              {t("home.ai.kicker", { defaultValue: "Intelligence artificielle intégrée" })}
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t("home.ai.title", { defaultValue: "L'IA vous épaule au quotidien." })}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t("home.ai.sub", {
                defaultValue:
                  "Pas un gadget. Une vraie assistance qui prend en charge les tâches répétitives — pour que les bénévoles se consacrent aux joueurs.",
              })}
            </p>
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-foreground/80">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8 h-11 px-6">
              <Link to="/features">{t("home.ai.cta", { defaultValue: "Découvrir l'assistant" })}<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-primary/10 to-secondary/10 blur-2xl" />
            <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/5">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-foreground">{t("home.ai.assistantName", { defaultValue: "Assistant Clubero" })}</p>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {t("home.ai.online", { defaultValue: "En ligne" })}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                  {t("home.ai.q1", { defaultValue: "Qui n'a pas encore payé la cotisation ?" })}
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-muted/50 px-4 py-2 text-sm text-foreground">
                  {t("home.ai.a1", { defaultValue: "3 joueurs : Lucas M., Sarah B. et Tom D. Je lance une relance par email ?" })}
                </div>
                <div className="ml-auto max-w-[60%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                  {t("home.ai.q2", { defaultValue: "Oui, en français." })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TournamentsStrip() {
  const { t } = useTranslation("marketing");
  const bullets = [
    t("home.tourn.b1", { defaultValue: "Inscriptions en ligne, paiement intégré" }),
    t("home.tourn.b2", { defaultValue: "Tableaux, poules, brackets, scores live" }),
    t("home.tourn.b3", { defaultValue: "Page publique TV pour vos spectateurs" }),
    t("home.tourn.b4", { defaultValue: "Convocations & feuilles de match incluses" }),
  ];
  return (
    <section className="border-b border-border/60 bg-muted/30 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <Trophy className="h-3.5 w-3.5" />
              {t("home.tourn.kicker", { defaultValue: "Module tournois — appli complète" })}
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t("home.tourn.title", { defaultValue: "Une vraie appli de gestion de tournois, dans Clubero." })}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t("home.tourn.sub", {
                defaultValue:
                  "Pas un module gadget : un outil professionnel utilisé par des dizaines de clubs et organisateurs indépendants. Du tournoi amical à la compétition régionale.",
              })}
            </p>
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-foreground/80">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="h-11 bg-amber-500 px-6 text-white hover:bg-amber-600">
                <Link to="/tournaments/start">
                  {t("home.tourn.cta", { defaultValue: "Démarrer un tournoi" })} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 px-6">
                <Link to="/pricing">{t("home.tourn.pricing", { defaultValue: "Voir les tarifs" })}</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {t("home.tourn.included", { defaultValue: "Inclus dans l'abonnement club" })}
                  </p>
                  <p className="font-display text-base font-semibold text-foreground">
                    {t("home.tourn.includedDesc", { defaultValue: "Tournois illimités, sans frais par événement" })}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("home.tourn.includedBody", {
                  defaultValue: "Si vous avez un abonnement Clubero, organisez autant de tournois que vous voulez sans surcoût.",
                })}
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    {t("home.tourn.standalone", { defaultValue: "Sans abonnement — à l'événement" })}
                  </p>
                  <p className="font-display text-base font-semibold text-foreground">
                    {t("home.tourn.standaloneDesc", { defaultValue: "Payez 40 € par tournoi, c'est tout" })}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {t("home.tourn.standaloneBody", {
                  defaultValue: "Vous organisez un tournoi ponctuel sans club ? Utilisez Clubero à la demande, sans engagement.",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialNetworkSection() {
  const { t } = useTranslation("marketing");
  return (
    <section className="border-b border-border/60 py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-secondary">
            <Network className="h-3.5 w-3.5" />
            {t("home.social.kicker", { defaultValue: "Le réseau social du sport amateur" })}
          </div>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("home.social.title", { defaultValue: "Au-delà de la gestion : on a créé le réseau des joueurs et des coachs." })}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t("home.social.sub", {
              defaultValue:
                "Chaque joueur a un vrai profil public — stats, carrière, médias. Chaque coach a une page. Tout le monde peut se suivre, se découvrir, se contacter.",
            })}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
          {[
            {
              icon: UserCircle2,
              title: t("home.social.c1Title", { defaultValue: "Profil joueur public" }),
              body: t("home.social.c1Body", { defaultValue: "Stats, carrière, médias — partageable, certifié par tes clubs." }),
            },
            {
              icon: GraduationCap,
              title: t("home.social.c2Title", { defaultValue: "Page coach" }),
              body: t("home.social.c2Body", { defaultValue: "Visibilité, suivi, recrutement. Les coachs ne sont plus invisibles." }),
            },
            {
              icon: Heart,
              title: t("home.social.c3Title", { defaultValue: "Followers & suivi" }),
              body: t("home.social.c3Body", { defaultValue: "Suivez vos clubs préférés, vos enfants, vos amis. Comme un vrai réseau." }),
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="rounded-3xl border border-border bg-card p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{c.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Button asChild variant="outline" className="h-11 px-6">
            <Link to="/register/player">
              {t("home.social.cta", { defaultValue: "Créer mon profil joueur" })} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  const { t } = useTranslation("marketing");
  return (
    <section className="relative overflow-hidden bg-primary/5 py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_15%,transparent),transparent_60%)]" />
      <div className="relative mx-auto max-w-3xl px-5 text-center lg:px-8">
        <h2 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("home.finalCta.title", { defaultValue: "Reprenez du temps pour le sport." })}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {t("home.finalCta.sub", { defaultValue: "Essai gratuit. Sans carte bancaire. Données hébergées en Europe." })}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-7">
            <Link to="/register">{t("home.finalCta.club", { defaultValue: "Créer mon club" })}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-7">
            <Link to="/register/player">{t("home.finalCta.player", { defaultValue: "Créer mon profil joueur" })}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}


const HOME_TILES = [
  { key: "tournaments", icon: Trophy, to: "/features", hash: "tournaments", accent: "from-[color:var(--victory)] to-[color:var(--energy)]" },
  { key: "convocations", icon: CalendarCheck, to: "/features", hash: "coach-ai", accent: "from-[color:var(--brand-blue)] to-[color:var(--secondary)]" },
  { key: "wall", icon: MessageSquareText, to: "/features", hash: "wall", accent: "from-[color:var(--brand-blue)] to-[color:var(--energy)]" },
  { key: "whatsapp", icon: MessageCircle, to: "/features", hash: "whatsapp", accent: "from-[#25D366] to-[#075E54]" },
  { key: "player", icon: Activity, to: "/features", hash: "player", accent: "from-[color:var(--primary)] to-[color:var(--brand-blue)]" },
  { key: "coach", icon: GraduationCap, to: "/features", hash: "coach-profile", accent: "from-[color:var(--brand-blue)] to-[color:var(--victory)]" },
  { key: "network", icon: Share2, to: "/features", hash: "network", accent: "from-[color:var(--energy)] to-[color:var(--brand-blue)]" },
  { key: "ai", icon: BrainCircuit, to: "/features", hash: "coach-ai", accent: "from-[color:var(--primary)] to-[color:var(--energy)]" },
] as const;

function HomeFeatureTiles() {
  const { t } = useTranslation("marketing");
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-gradient-to-br from-background via-muted/15 to-background">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--energy)]/40 to-transparent" />
      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Zap className="h-3 w-3 text-[color:var(--energy)]" />
            {t("home.allChip")}
          </div>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {t("home.allTitle")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("home.allSub")}</p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOME_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.key}
                to={tile.to}
                hash={tile.hash}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-[color:var(--brand-blue)]/40"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tile.accent} text-white shadow-md group-hover:scale-110 transition-transform`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-base font-bold tracking-tight">
                  {t(`home.tile_${tile.key}_t`)}
                </h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {t(`home.tile_${tile.key}_b`)}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  {t("home.allCta")} <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Button asChild size="lg" variant="outline" className="h-12 px-6">
            <Link to="/features">
              {t("home.allCtaAll")} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function TournamentsSection() {
  const { t, i18n } = useTranslation("marketing");
  const tournamentsTo = i18n.language?.slice(0, 2) === "fr" ? "/fr/tournois" : "/en/tournaments";
  const features = [
    { t: t("tournaments.home.feat1Title"), d: t("tournaments.home.feat1Body") },
    { t: t("tournaments.home.feat2Title"), d: t("tournaments.home.feat2Body") },
    { t: t("tournaments.home.feat3Title"), d: t("tournaments.home.feat3Body") },
    { t: t("tournaments.home.feat4Title"), d: t("tournaments.home.feat4Body") },
    { t: t("tournaments.home.feat5Title"), d: t("tournaments.home.feat5Body") },
    { t: t("tournaments.home.feat6Title"), d: t("tournaments.home.feat6Body") },
  ];
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-gradient-to-br from-[color:var(--victory)]/10 via-background to-[color:var(--energy)]/10">
      <div aria-hidden className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--victory)]/20 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[color:var(--energy)]/20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--victory)]/40 bg-[color:var(--victory)]/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[color:var(--victory)]">
              <Trophy className="h-3.5 w-3.5" />
              {t("tournaments.home.badge")}
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              {t("tournaments.home.titlePre")}<span className="text-gradient-energy">{t("tournaments.home.titleHighlight")}</span>{t("tournaments.home.titlePost")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {t("tournaments.home.subtitle")}
            </p>

            <ul className="mt-7 space-y-3">
              {features.map((p) => (
                <li key={p.t} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--victory)]" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.t}</p>
                    <p className="text-sm text-muted-foreground">{p.d}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 shadow-elevated hover:shadow-glow transition-shadow">
                <Link to="/tournaments/start">
                  {t("tournaments.home.ctaStart")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6">
                <Link to={tournamentsTo}>{t("tournaments.home.ctaFeatures")}</Link>
              </Button>
            </div>
          </div>

          {/* Standings / live match mock */}
          <div className="lg:col-span-6">
            <div className="relative mx-auto max-w-md">
              <div
                aria-hidden
                className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-60 blur-3xl"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--victory) 55%, transparent), color-mix(in oklab, var(--energy) 45%, transparent))",
                }}
              />

              <div className="rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
                <div className="flex items-center justify-between bg-gradient-to-r from-[color:var(--victory)] to-[color:var(--energy)] px-4 py-3 text-white">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/20">
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">{t("tournaments.home.mockTournament")}</p>
                      <p className="text-[11px] text-white/80">{t("tournaments.home.mockPhase")}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    {t("tournaments.home.mockLive")}
                  </span>
                </div>

                <div className="px-4 py-4 space-y-1.5">
                  {[
                    { p: 1, t: "FC Riverside", pts: 9, w: 3, d: 0, l: 0, top: true },
                    { p: 2, t: "AS Montagne", pts: 6, w: 2, d: 0, l: 1, top: true },
                    { p: 3, t: "Étoile FC", pts: 3, w: 1, d: 0, l: 2, top: false },
                    { p: 4, t: "Club Atlantique", pts: 0, w: 0, d: 0, l: 3, top: false },
                  ].map((r) => (
                    <div
                      key={r.t}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.top ? "bg-[color:var(--victory)]/10" : "bg-muted/40"}`}
                    >
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${r.top ? "bg-[color:var(--victory)] text-white" : "bg-muted text-muted-foreground"}`}>{r.p}</span>
                      <span className="flex-1 text-sm font-semibold truncate">{r.t}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{r.w}V {r.d}N {r.l}D</span>
                      <span className="w-8 text-right text-sm font-bold tabular-nums">{r.pts}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border bg-muted/30 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("tournaments.home.mockOngoing")}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="flex-1 text-sm font-bold truncate">FC Riverside</p>
                    <div className="px-3 text-center">
                      <p className="font-display text-xl font-bold tabular-nums leading-none">2 — 1</p>
                      <p className="mt-0.5 text-[10px] text-[color:var(--energy)] font-bold uppercase tracking-wider">68'</p>
                    </div>
                    <p className="flex-1 text-right text-sm font-bold truncate">AS Montagne</p>
                  </div>
                </div>
              </div>

              <div className="absolute -top-4 -right-4 z-10 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[color:var(--victory)] to-[color:var(--energy)] text-white">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("tournaments.home.mockTeamsRegistered")}</p>
                  <p className="text-sm font-bold tabular-nums">16 / 16</p>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-4 z-10 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-elevated">
                <Sparkles className="h-3.5 w-3.5 text-[color:var(--energy)]" />
                <span className="text-[11px] font-bold uppercase tracking-wider">{t("tournaments.home.mockTvAvailable")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



export function WhatsAppHybrid() {
  const { t } = useTranslation("marketing");
  const points = [
    { t: t("whatsapp.p1Title"), d: t("whatsapp.p1Body") },
    { t: t("whatsapp.p2Title"), d: t("whatsapp.p2Body") },
    { t: t("whatsapp.p3Title"), d: t("whatsapp.p3Body") },
    { t: t("whatsapp.p4Title"), d: t("whatsapp.p4Body") },
  ];
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div aria-hidden className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <MessageCircle className="h-3.5 w-3.5" />
              {t("whatsapp.chip")}
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              {t("whatsapp.title1")}
              <br />
              {t("whatsapp.title2")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {t("whatsapp.body")}
            </p>

            <ul className="mt-7 space-y-3">
              {points.map((p) => (
                <li key={p.t} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.t}</p>
                    <p className="text-sm text-muted-foreground">{p.d}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 shadow-elevated">
                <Link to="/demo">
                  {t("whatsapp.cta")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                {t("whatsapp.ctaNote")}
              </span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative mx-auto max-w-md">
              <div
                aria-hidden
                className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-50 blur-3xl"
                style={{ background: "linear-gradient(135deg, #25D36680, #075E5460)" }}
              />
              <div className="rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
                <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold">U13</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{t("whatsapp.mockGroup")}</p>
                    <p className="text-[11px] text-white/70">{t("whatsapp.mockMembers")}</p>
                  </div>
                  <MessageCircle className="h-4 w-4 text-white/80" />
                </div>

                <div className="bg-[#ECE5DD] px-4 py-5">
                  <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2.5 shadow-sm">
                    <p className="text-[13px] leading-relaxed text-[#111]">
                      ⚽ <strong>U13 vs FC Riverside</strong>
                      <br />
                      <em className="text-[12px] text-[#333]">FC Clubero · U13</em>
                      <br />
                      🏅 {t("whatsapp.mockChampionship")} · 🏠 {t("whatsapp.mockHome")}
                      <br />
                      <br />
                      📅 {t("home.heroDate")}
                      <br />
                      ⏰ {t("whatsapp.mockConvocation")}
                      <br />
                      📍 Stade Municipal
                      <br />
                      <br />
                      👥 <strong>{t("whatsapp.mockSummoned")}</strong>
                      <br />
                      • Lucas M. • Emma D. • Noah B.
                      <br />
                      • Léa S. • Adam K. • Hugo P.
                      <br />
                      <span className="text-[#555]">{t("whatsapp.mockOthers")}</span>
                      <br />
                      <br />
                      <span className="text-[11px] text-[#666]">{t("whatsapp.mockSentVia")}</span>
                    </p>
                    <p className="mt-1 text-right text-[10px] text-[#888]">14:32 ✓✓</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border bg-card px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Zap className="h-3 w-3 text-[color:var(--energy)]" />
                    {t("whatsapp.mockSentIn")}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#25D366]">WhatsApp</span>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-4 z-10 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-primary text-white">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("whatsapp.mockTracking")}</p>
                  <p className="text-sm font-bold tabular-nums">11 / 12</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


export function ClubWallSection() {
  const { t } = useTranslation("marketing");
  const points = [
    { t: t("clubWall.p1Title"), d: t("clubWall.p1Body") },
    { t: t("clubWall.p2Title"), d: t("clubWall.p2Body") },
    { t: t("clubWall.p3Title"), d: t("clubWall.p3Body") },
    { t: t("clubWall.p4Title"), d: t("clubWall.p4Body") },
  ];
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-gradient-to-br from-[color:var(--brand-blue)]/8 via-background to-[color:var(--energy)]/8">
      <div aria-hidden className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[color:var(--brand-blue)]/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--energy)]/15 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
              <Share2 className="h-3.5 w-3.5" />
              {t("clubWall.chip")}
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              {t("clubWall.titlePre")}<span className="text-gradient-primary">{t("clubWall.titleHighlight")}</span>{t("clubWall.titlePost")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("clubWall.body")}</p>
            <ul className="mt-7 space-y-3">
              {points.map((p) => (
                <li key={p.t} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand-blue)]" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.t}</p>
                    <p className="text-sm text-muted-foreground">{p.d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 shadow-elevated hover:shadow-glow transition-shadow">
                <Link to="/demo">{t("clubWall.cta")} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <span className="text-xs text-muted-foreground">{t("clubWall.ctaNote")}</span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative mx-auto max-w-md">
              <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-50 blur-3xl" style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--brand-blue) 55%, transparent), color-mix(in oklab, var(--energy) 45%, transparent))" }} />

              <div className="rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
                <div className="flex items-center justify-between bg-gradient-primary px-4 py-3 text-white">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/20">
                      <MessageSquareText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">{t("clubWall.mockTitle")}</p>
                      <p className="text-[11px] text-white/80">{t("clubWall.mockSubtitle")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/20"><Camera className="h-3.5 w-3.5" /></span>
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/20"><Hash className="h-3.5 w-3.5" /></span>
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4">
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-energy text-white text-xs font-bold">FC</div>
                        <div>
                          <p className="text-[12px] font-bold leading-tight">{t("clubWall.mockPostAdminName")}</p>
                          <p className="text-[10px] text-muted-foreground">{t("clubWall.mockPostAdminTime")}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--energy)]/15 px-2 py-0.5 text-[10px] font-bold text-[color:var(--energy)]">
                        <Pin className="h-2.5 w-2.5" /> {t("clubWall.mockPostAdminPinned")}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-foreground">{t("clubWall.mockPostAdminBody")}</p>
                    <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1"><Heart className="h-3 w-3 text-[color:var(--energy)]" /> {t("clubWall.mockPostAdminStats")}</p>
                  </div>

                  <div className="rounded-2xl border border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue)]/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 text-white">
                          <Camera className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-[12px] font-bold leading-tight">{t("clubWall.mockPostSocialName")}</p>
                          <p className="text-[10px] text-muted-foreground">{t("clubWall.mockPostSocialTime")}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-card px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--brand-blue-deep)] border border-[color:var(--brand-blue)]/30">
                        {t("clubWall.mockPostSocialTag")}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-foreground">{t("clubWall.mockPostSocialBody")}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5">
                  <div className="flex-1 rounded-full bg-card px-3 py-2 text-xs text-muted-foreground border border-border">{t("clubWall.mockComposerPh")}</div>
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"><Send className="h-3.5 w-3.5" /></div>
                </div>
              </div>

              <div className="absolute -top-4 -right-4 z-10 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-elevated">
                <Sparkles className="h-3.5 w-3.5 text-[color:var(--brand-blue)]" />
                <span className="text-[11px] font-bold uppercase tracking-wider">{t("clubWall.mockBadgeSynced")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PlayerJournalSection() {
  const { t } = useTranslation("marketing");
  const points = [
    { t: t("playerJournal.p1Title"), d: t("playerJournal.p1Body") },
    { t: t("playerJournal.p2Title"), d: t("playerJournal.p2Body") },
    { t: t("playerJournal.p3Title"), d: t("playerJournal.p3Body") },
    { t: t("playerJournal.p4Title"), d: t("playerJournal.p4Body") },
  ];
  // 12-week attendance heatmap
  const heat = [3, 3, 2, 3, 3, 1, 3, 3, 3, 2, 3, 3];
  const stats = [
    { l: t("playerJournal.mockStatGames"), v: "18" },
    { l: t("playerJournal.mockStatGoals"), v: "7" },
    { l: t("playerJournal.mockStatAssists"), v: "11" },
    { l: t("playerJournal.mockStatRating"), v: "8.2" },
  ];
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-muted/20">
      <div aria-hidden className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--primary)]/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[color:var(--victory)]/15 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-6 order-2 lg:order-1">
            <div className="relative mx-auto max-w-md">
              <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-50 blur-3xl bg-gradient-primary" />

              <div className="rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
                <div className="flex items-center gap-3 bg-gradient-to-r from-[color:var(--primary)] to-[color:var(--brand-blue)] px-4 py-3 text-white">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 text-base font-bold">LM</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{t("playerJournal.mockName")}</p>
                    <p className="text-[11px] text-white/80">{t("playerJournal.mockMeta")}</p>
                  </div>
                  <Star className="h-4 w-4 text-[color:var(--energy)]" />
                </div>

                <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5 text-[11px] font-semibold">
                  <span className="rounded-md bg-card px-2.5 py-1 shadow-sm text-foreground">{t("playerJournal.mockTabStats")}</span>
                  <span className="rounded-md px-2.5 py-1 text-muted-foreground">{t("playerJournal.mockTabAttendance")}</span>
                  <span className="rounded-md px-2.5 py-1 text-muted-foreground">{t("playerJournal.mockTabFeedback")}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 px-4 py-3">
                  {stats.map((s) => (
                    <div key={s.l} className="rounded-xl bg-muted/40 p-2 text-center">
                      <p className="font-display text-lg font-bold tabular-nums text-gradient-primary">{s.v}</p>
                      <p className="text-[10px] text-muted-foreground">{s.l}</p>
                    </div>
                  ))}
                </div>

                <div className="px-4 pb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{t("playerJournal.mockAttendanceLabel")}</p>
                  <div className="grid grid-cols-12 gap-1">
                    {heat.map((v, i) => (
                      <div
                        key={i}
                        className={`h-5 rounded ${v === 3 ? "bg-[color:var(--primary)]" : v === 2 ? "bg-[color:var(--primary)]/55" : v === 1 ? "bg-[color:var(--primary)]/25" : "bg-muted"}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
                  <p className="text-[11px] font-bold text-foreground">{t("playerJournal.mockFeedbackCoach")}</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{t("playerJournal.mockFeedbackBody")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[color:var(--victory)]/15 px-2 py-0.5 text-[10px] font-bold text-[color:var(--victory)]">+ {t("playerJournal.mockFeedbackTagStrong")}</span>
                    <span className="rounded-full bg-[color:var(--energy)]/15 px-2 py-0.5 text-[10px] font-bold text-[color:var(--energy)]">↗ {t("playerJournal.mockFeedbackTagWork")}</span>
                  </div>
                </div>

                <div className="border-t border-border bg-gradient-to-r from-[color:var(--primary)]/10 to-[color:var(--brand-blue)]/10 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--brand-blue-deep)] border border-[color:var(--brand-blue)]/30">
                      <Sparkles className="h-2.5 w-2.5" /> {t("playerJournal.mockAiBadge")}
                    </span>
                  </div>
                  <p className="text-[12px] text-foreground leading-relaxed">{t("playerJournal.mockAiBody")}</p>
                </div>
              </div>

              <div className="absolute -top-4 -right-4 z-10 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-energy text-white">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Saison</p>
                  <p className="text-sm font-bold tabular-nums">+18%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--primary)]/30 bg-[color:var(--primary)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
              <BookOpen className="h-3.5 w-3.5" />
              {t("playerJournal.chip")}
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              {t("playerJournal.titlePre")}<span className="text-gradient-primary">{t("playerJournal.titleHighlight")}</span>{t("playerJournal.titlePost")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("playerJournal.body")}</p>
            <ul className="mt-7 space-y-3">
              {points.map((p) => (
                <li key={p.t} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.t}</p>
                    <p className="text-sm text-muted-foreground">{p.d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 shadow-elevated hover:shadow-glow transition-shadow">
                <Link to="/demo">{t("playerJournal.cta")} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <span className="text-xs text-muted-foreground">{t("playerJournal.ctaNote")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CoachAssistSection() {
  const { t } = useTranslation("marketing");
  const points = [
    { t: t("coachAssist.p1Title"), d: t("coachAssist.p1Body") },
    { t: t("coachAssist.p2Title"), d: t("coachAssist.p2Body") },
    { t: t("coachAssist.p3Title"), d: t("coachAssist.p3Body") },
    { t: t("coachAssist.p4Title"), d: t("coachAssist.p4Body") },
  ];
  const tasks = [
    { icon: Bell, body: t("coachAssist.mockTask1"), cta: t("coachAssist.mockTask1Cta"), accent: "text-[color:var(--energy)] bg-[color:var(--energy)]/15" },
    { icon: ClipboardList, body: t("coachAssist.mockTask2"), cta: t("coachAssist.mockTask2Cta"), accent: "text-[color:var(--brand-blue-deep)] bg-[color:var(--brand-blue)]/15" },
    { icon: Users, body: t("coachAssist.mockTask3"), cta: t("coachAssist.mockTask3Cta"), accent: "text-[color:var(--victory)] bg-[color:var(--victory)]/15" },
  ];
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-gradient-to-br from-[color:var(--primary)]/8 via-background to-[color:var(--brand-blue)]/8">
      <div aria-hidden className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[color:var(--primary)]/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--energy)]/15 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--primary)]/30 bg-[color:var(--primary)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
              <Bot className="h-3.5 w-3.5" />
              {t("coachAssist.chip")}
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              {t("coachAssist.titlePre")}<span className="text-gradient-primary">{t("coachAssist.titleHighlight")}</span>{t("coachAssist.titlePost")}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t("coachAssist.body")}</p>
            <ul className="mt-7 space-y-3">
              {points.map((p) => (
                <li key={p.t} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{p.t}</p>
                    <p className="text-sm text-muted-foreground">{p.d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 shadow-elevated hover:shadow-glow transition-shadow">
                <Link to="/demo">{t("coachAssist.cta")} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <span className="text-xs text-muted-foreground">{t("coachAssist.ctaNote")}</span>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative mx-auto max-w-md">
              <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-50 blur-3xl bg-gradient-primary" />

              <div className="rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
                <div className="bg-gradient-hero px-4 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--energy)]">Clubero · Coach</p>
                  <p className="mt-1 font-display text-lg font-bold">{t("coachAssist.mockTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("coachAssist.mockSubtitle")}</p>
                </div>

                <div className="px-4 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ListChecks className="h-3.5 w-3.5 text-[color:var(--energy)]" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("coachAssist.mockInsightsLabel")}</p>
                  </div>
                  <div className="space-y-2">
                    {tasks.map((task) => {
                      const Icon = task.icon;
                      return (
                        <div key={task.body} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5">
                          <span className={`grid h-8 w-8 place-items-center rounded-lg ${task.accent}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <p className="flex-1 text-[12px] font-medium leading-tight">{task.body}</p>
                          <button className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                            {task.cta}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-3.5 w-3.5 text-[color:var(--brand-blue)]" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("coachAssist.mockAssistantLabel")}</p>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[12px] text-primary-foreground shadow-sm">
                      {t("coachAssist.mockAssistantQ")}
                    </div>
                  </div>
                  <p className="text-[12px] leading-relaxed text-foreground">{t("coachAssist.mockAssistantA")}</p>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-4 z-10 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-energy text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Insights</p>
                  <p className="text-sm font-bold tabular-nums">3 à faire</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


function Hero() {
  const { t } = useTranslation("marketing");

  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-gradient-hero">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.22] bg-pitch"
        style={{
          maskImage: "radial-gradient(ellipse 75% 60% at 50% 35%, black 25%, transparent 80%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.10] bg-jersey-stripes"
      />
      <div aria-hidden className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[color:var(--primary)]/30 blur-3xl animate-float" />
      <div aria-hidden className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--brand-blue)]/30 blur-3xl" />

      <div className="mx-auto max-w-7xl px-5 pt-12 pb-14 lg:px-8 lg:pt-16 lg:pb-24">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-10 lg:items-center">
          <div className="lg:col-span-7">
            <div className="flex items-center">
              <img src="/clubero-logo.png" alt="Clubero" className="h-16 w-auto object-contain md:h-20" />
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[color:var(--energy)]/30 bg-[color:var(--energy)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--energy)] backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-[color:var(--energy)] animate-ping opacity-75" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-[color:var(--energy)]" />
              </span>
              {t("home.badge2")}
            </div>
            <h1 className="mt-5 font-display text-[2.5rem] font-bold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              {t("home.heroLine1")}
              <br />
              {t("home.heroLine2")}
              <br />
              <span className="text-gradient-primary">{t("home.heroLine3")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              {t("home.heroSub")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base shadow-elevated hover:shadow-glow transition-shadow">
                <Link to="/register">
                  {t("home.ctaClub")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <Link to="/register/player">{t("home.ctaPlayer")}</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("home.ctaCoachHint")}{" "}
              <Link to="/register" className="font-semibold text-primary hover:underline">
                {t("home.ctaCoach")} <ArrowRight className="inline h-3 w-3" />
              </Link>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.freeTrial")}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.noCard")}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.hostedEU")}</span>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4 max-w-lg">
              {[
                { v: "12s", l: t("home.statConvoke") },
                { v: "+78%", l: t("home.statResponse") },
                { v: "3", l: t("home.statChannels") },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur px-3 py-3">
                  <dt className="font-display text-2xl font-bold text-gradient-primary">{s.v}</dt>
                  <dd className="text-[11px] font-medium text-muted-foreground mt-0.5">{s.l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative lg:col-span-5">
            <div className="relative mx-auto max-w-sm">
              <div
                aria-hidden
                className="absolute -inset-8 -z-10 rounded-[2.5rem] opacity-60 blur-3xl"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--logo-blue) 55%, transparent), color-mix(in oklab, var(--energy) 45%, transparent))",
                }}
              />

              <div className="absolute -top-4 -left-4 z-10 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-elevated animate-float">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-[color:var(--logo-blue)] animate-ping opacity-75" />
                  <span className="relative h-2 w-2 rounded-full bg-[color:var(--logo-blue)]" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider">Live · 2-1</span>
              </div>

              <div className="absolute -bottom-4 -right-4 z-10 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-energy text-white">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Présence</p>
                  <p className="text-sm font-bold tabular-nums">94%</p>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-card p-5 shadow-elevated">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--energy)]">
                      Samedi · 14:30
                    </p>
                    <p className="font-display text-base font-bold mt-0.5">
                      U13 — vs FC Riverside
                    </p>
                  </div>
                  <span className="rounded-full bg-gradient-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                    {t("home.heroBadgeConvocation")}
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Lucas M.", status: t("home.heroStatusPresent"), c: "bg-primary/15 text-[color:var(--secondary)]" },
                    { name: "Emma D.", status: t("home.heroStatusPresent"), c: "bg-primary/15 text-[color:var(--secondary)]" },
                    { name: "Noah B.", status: t("home.heroStatusMaybe"), c: "bg-amber-500/15 text-amber-700" },
                    { name: "Léa S.", status: t("home.heroStatusAbsent"), c: "bg-red-500/15 text-red-700" },
                    { name: "Adam K.", status: t("home.heroStatusPending"), c: "bg-muted text-muted-foreground" },
                  ].map((p, i) => (
                    <div
                      key={p.name}
                      className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 transition-transform hover:scale-[1.02] hover:bg-muted"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[color:var(--brand-blue)] to-[color:var(--secondary)] text-xs font-bold text-white grid place-items-center ring-2 ring-card">
                          {p.name[0]}
                        </div>
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.c}`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("home.heroResponded")}</span>

                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-[78%] bg-gradient-primary rounded-full" />
                    </div>
                    <span className="text-xs font-bold tabular-nums">78%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURE_META = [
  { icon: CalendarCheck, accent: "from-[color:var(--brand-blue)] to-[color:var(--secondary)]" },
  { icon: Users, accent: "from-[color:var(--primary)] to-[color:var(--brand-blue)]" },
  { icon: Bell, accent: "from-[color:var(--energy)] to-[color:var(--victory)]" },
  { icon: MessageSquareText, accent: "from-[color:var(--energy)] to-[color:var(--victory)]" },
  { icon: Trophy, accent: "from-[color:var(--victory)] to-[color:var(--brand-blue)]" },
  { icon: Trophy, accent: "from-[color:var(--victory)] to-[color:var(--energy)]" },
  { icon: BarChart3, accent: "from-[color:var(--primary)] to-[color:var(--victory)]" },
  { icon: BrainCircuit, accent: "from-[color:var(--primary)] to-[color:var(--brand-blue)]" },
  { icon: Activity, accent: "from-[color:var(--brand-blue)] to-[color:var(--energy)]" },
  { icon: ShieldCheck, accent: "from-[color:var(--secondary)] to-[color:var(--primary)]" },
  { icon: BookOpen, accent: "from-[color:var(--brand-blue)] to-[color:var(--primary)]" },
  { icon: Share2, accent: "from-[color:var(--energy)] to-[color:var(--brand-blue)]" },
  { icon: UploadCloud, accent: "from-[color:var(--victory)] to-[color:var(--secondary)]" },
  { icon: FileText, accent: "from-[color:var(--primary)] to-[color:var(--energy)]" },
  { icon: Swords, accent: "from-[color:var(--secondary)] to-[color:var(--victory)]" },
  { icon: Activity, accent: "from-[color:var(--brand-blue)] to-[color:var(--primary)]" },
  { icon: ShieldCheck, accent: "from-[color:var(--energy)] to-[color:var(--secondary)]" },
];

function FeaturesGrid() {
  const { t } = useTranslation("marketing");

  return (
    <section className="relative border-b border-border/60 overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--energy)]/40 to-transparent" />
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Zap className="h-3 w-3 text-[color:var(--energy)]" />
            {t("home.featuresChip")}
          </div>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {t("home.featuresTitle")}
            <br />
            <span className="text-gradient-energy">{t("home.featuresSubtitle")}</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t("home.featuresBody")}
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_META.map((f, i) => {
            const title = t(`home.feat${i + 1}Title`);
            const body = t(`home.feat${i + 1}Body`);
            const Icon = f.icon;
            return (
              <div
                key={title}
                className="group relative rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-[color:var(--brand-blue)]/40"
              >
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--brand-blue)]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.accent} text-white shadow-md group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


const AUDIENCE_META = [
  { key: "Clubs", icon: Trophy, pts: ["audClubsP1", "audClubsP2", "audClubsP3"], titleKey: "audClubs" },
  { key: "Coaches", icon: Zap, pts: ["audCoachesP1", "audCoachesP2", "audCoachesP3"], titleKey: "audCoaches" },
  { key: "Parents", icon: Bell, pts: ["audParentsP1", "audParentsP2", "audParentsP3"], titleKey: "audParents" },
  { key: "Players", icon: Activity, pts: ["audPlayersP1", "audPlayersP2", "audPlayersP3"], titleKey: "audPlayers" },
];


function ForEveryone() {
  const { t } = useTranslation("marketing");

  return (
    <section className="border-b border-border/60 bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--energy)]">
            {t("home.forEveryone")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {t("home.forEveryoneTitle")}
          </h2>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(t("features.audiences", { returnObjects: true }) as { t: string; p: string[] }[]).map((a, i) => {
            const Icon = AUDIENCE_META[i]?.icon ?? Trophy;
            return (
              <div
                key={a.t}
                className="group relative rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-elevated"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary text-white shadow-sm group-hover:scale-110 transition-transform">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-display text-xl font-bold">{a.t}</h3>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {a.p.map((p: string) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}

function CTA() {
  const { t } = useTranslation("marketing");



  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-border p-10 lg:p-16 text-center bg-gradient-cta shadow-elevated">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 50% 50%, transparent 70px, rgba(255,255,255,0.6) 70px, rgba(255,255,255,0.6) 72px, transparent 73px), linear-gradient(to right, transparent calc(50% - 1px), rgba(255,255,255,0.5) calc(50% - 1px), rgba(255,255,255,0.5) calc(50% + 1px), transparent calc(50% + 1px))",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          />
          <div aria-hidden className="absolute inset-0 opacity-[0.06] bg-jersey-stripes" />
          <div aria-hidden className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[color:var(--primary)]/40 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur">
              <Flame className="h-3 w-3" /> {t("home.ctaSeason")}
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
              {t("home.ctaFinalTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/80">
              {t("home.ctaFinalSub")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 bg-white text-[color:var(--brand-blue-deep)] hover:bg-white/90 hover:scale-105 transition-transform shadow-lg">
                <Link to="/register">{t("home.ctaClub")} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link to="/register/player">{t("home.ctaPlayer")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketingProfileSection({
  bgClass,
  chipColorClass,
  bulletColorClass,
  chipIcon: ChipIcon,
  chip,
  title,
  subtitle,
  points,
  ctaLabel,
  ctaTo,
}: {
  bgClass: string;
  chipColorClass: string;
  bulletColorClass: string;
  chipIcon: React.ComponentType<{ className?: string }>;
  chip: string;
  title: string;
  subtitle: string;
  points: { t: string; d: string }[];
  ctaLabel: string;
  ctaTo: string;
}) {
  return (
    <section className={`relative border-b border-border/60 overflow-hidden ${bgClass}`}>
      <div aria-hidden className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--primary)]/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[color:var(--brand-blue)]/10 blur-3xl" />
      <div className="relative mx-auto max-w-3xl px-5 py-20 lg:px-8 lg:py-24 text-center">
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${chipColorClass}`}>
          <ChipIcon className="h-3.5 w-3.5" />
          {chip}
        </div>
        <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 text-left">
          {points.map((p) => (
            <li key={p.t} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${bulletColorClass}`} />
              <div>
                <p className="text-sm font-semibold text-foreground">{p.t}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.d}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex justify-center">
          <Button asChild size="lg" className="h-12 px-6 shadow-elevated hover:shadow-glow transition-shadow">
            <Link to={ctaTo}>
              {ctaLabel} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function PlayersSection() {
  const { t } = useTranslation("marketing");
  return (
    <MarketingProfileSection
      bgClass="bg-gradient-to-br from-[color:var(--primary)]/8 via-background to-[color:var(--brand-blue)]/8"
      chipColorClass="border-[color:var(--primary)]/30 bg-[color:var(--primary)]/10 text-[color:var(--brand-blue-deep)]"
      bulletColorClass="text-[color:var(--primary)]"
      chipIcon={Activity}
      chip={t("players.sectionChip")}
      title={t("players.sectionTitle")}
      subtitle={t("players.sectionSub")}
      points={[
        { t: t("players.p1Title"), d: t("players.p1Body") },
        { t: t("players.p2Title"), d: t("players.p2Body") },
        { t: t("players.p3Title"), d: t("players.p3Body") },
        { t: t("players.p4Title"), d: t("players.p4Body") },
      ]}
      ctaLabel={t("home.ctaPlayer")}
      ctaTo="/register/player"
    />
  );
}

export function CoachProfileSection() {
  const { t } = useTranslation("marketing");
  return (
    <MarketingProfileSection
      bgClass="bg-gradient-to-br from-[color:var(--brand-blue)]/8 via-background to-[color:var(--victory)]/8"
      chipColorClass="border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue-deep)]"
      bulletColorClass="text-[color:var(--brand-blue)]"
      chipIcon={Star}
      chip={t("coachProfile.sectionChip")}
      title={t("coachProfile.sectionTitle")}
      subtitle={t("coachProfile.sectionSub")}
      points={[
        { t: t("coachProfile.p1Title"), d: t("coachProfile.p1Body") },
        { t: t("coachProfile.p2Title"), d: t("coachProfile.p2Body") },
        { t: t("coachProfile.p3Title"), d: t("coachProfile.p3Body") },
        { t: t("coachProfile.p4Title"), d: t("coachProfile.p4Body") },
      ]}
      ctaLabel={t("home.ctaCoach")}
      ctaTo="/register"
    />
  );
}

export function NetworkSection() {
  const { t } = useTranslation("marketing");
  return (
    <MarketingProfileSection
      bgClass="bg-gradient-to-br from-[color:var(--energy)]/8 via-background to-[color:var(--victory)]/8"
      chipColorClass="border-[color:var(--energy)]/30 bg-[color:var(--energy)]/10 text-[color:var(--energy)]"
      bulletColorClass="text-[color:var(--energy)]"
      chipIcon={Share2}
      chip={t("network.sectionChip")}
      title={t("network.sectionTitle")}
      subtitle={t("network.sectionSub")}
      points={[
        { t: t("network.p1Title"), d: t("network.p1Body") },
        { t: t("network.p2Title"), d: t("network.p2Body") },
        { t: t("network.p3Title"), d: t("network.p3Body") },
      ]}
      ctaLabel={t("home.ctaExplore")}
      ctaTo="/players"
    />
  );
}

function ProductPreview() {
  const { t } = useTranslation("marketing");

  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-gradient-to-br from-background via-muted/20 to-background">
      <div aria-hidden className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-[40rem] rounded-full bg-[color:var(--brand-blue)]/15 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {t("home.previewTitle")}
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3 lg:gap-6">
          {/* Mock 1 — Coach dashboard */}
          <div className="relative mx-auto w-full max-w-xs">
            <div
              aria-hidden
              className="absolute -inset-4 -z-10 rounded-[2rem] opacity-50 blur-2xl"
              style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 50%, transparent), color-mix(in oklab, var(--brand-blue) 40%, transparent))" }}
            />
            <div className="rounded-[2rem] border border-border bg-card p-4 shadow-elevated rotate-[-1.5deg] hover:rotate-0 transition-transform">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("home.previewMock1Title")}</p>
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-primary text-white">
                  <CalendarCheck className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="rounded-2xl bg-muted/50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--energy)]">{t("home.previewMock1Avail")}</p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {["L", "E", "N", "H"].map((c) => (
                      <div key={c} className="h-6 w-6 rounded-full bg-gradient-to-br from-[color:var(--brand-blue)] to-[color:var(--secondary)] text-[10px] font-bold text-white grid place-items-center ring-2 ring-card">{c}</div>
                    ))}
                  </div>
                  <span className="text-xs font-bold tabular-nums">14/18</span>
                </div>
              </div>
              <div className="mt-3 rounded-2xl bg-muted/50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("home.previewMock1Upcoming")}</p>
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate">U13 vs FC Riverside</span>
                    <span className="text-[10px] text-muted-foreground">Sam 14:30</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold truncate">U15 Entraînement</span>
                    <span className="text-[10px] text-muted-foreground">Mer 18:00</span>
                  </div>
                </div>
              </div>
              <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2 text-xs font-bold text-white shadow-sm">
                <Plus className="h-3.5 w-3.5" /> {t("home.previewMock1Cta")}
              </button>
            </div>
          </div>

          {/* Mock 2 — Public player profile */}
          <div className="relative mx-auto w-full max-w-xs">
            <div
              aria-hidden
              className="absolute -inset-4 -z-10 rounded-[2rem] opacity-50 blur-2xl"
              style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--victory) 50%, transparent), color-mix(in oklab, var(--energy) 40%, transparent))" }}
            />
            <div className="rounded-[2rem] border border-border bg-card p-4 shadow-elevated md:translate-y-4 hover:translate-y-0 transition-transform">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[color:var(--brand-blue)] to-[color:var(--secondary)] text-lg font-bold text-white grid place-items-center ring-4 ring-card shadow-md">
                  LM
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold truncate">Lucas Martin</p>
                  <p className="text-[11px] text-muted-foreground truncate">FC Clubero · U15</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl bg-muted/50 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("home.previewMock2Season")}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div><p className="font-display text-base font-bold tabular-nums">18</p><p className="text-[9px] uppercase text-muted-foreground">Matchs</p></div>
                  <div><p className="font-display text-base font-bold tabular-nums">12</p><p className="text-[9px] uppercase text-muted-foreground">Buts</p></div>
                  <div><p className="font-display text-base font-bold tabular-nums">94%</p><p className="text-[9px] uppercase text-muted-foreground">Présence</p></div>
                </div>
              </div>
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--victory)]/40 bg-[color:var(--victory)]/15 px-2.5 py-1 text-[10px] font-bold text-[color:var(--victory)]">
                <Trophy className="h-3 w-3" /> {t("home.previewMock2Badge")}
              </div>
              <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted">
                <UserPlus className="h-3.5 w-3.5" /> {t("home.previewMock2Follow")}
              </button>
            </div>
          </div>

          {/* Mock 3 — Club wall */}
          <div className="relative mx-auto w-full max-w-xs">
            <div
              aria-hidden
              className="absolute -inset-4 -z-10 rounded-[2rem] opacity-50 blur-2xl"
              style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--energy) 50%, transparent), color-mix(in oklab, var(--brand-blue) 40%, transparent))" }}
            />
            <div className="rounded-[2rem] border border-border bg-card p-4 shadow-elevated rotate-[1.5deg] hover:rotate-0 transition-transform">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("home.previewMock3Title")}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-2 py-0.5 text-[9px] font-bold text-white">
                  <Camera className="h-2.5 w-2.5" /> {t("home.previewMock3Ig")}
                </span>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-3">
                <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-[color:var(--energy)]/15 px-2 py-0.5 text-[10px] font-bold text-[color:var(--energy)]">
                  <Pin className="h-2.5 w-2.5" /> {t("home.previewMock3Pinned")}
                </div>
                <div className="h-20 rounded-xl bg-gradient-to-br from-[color:var(--brand-blue)]/30 to-[color:var(--victory)]/30 grid place-items-center">
                  <Trophy className="h-7 w-7 text-white/80" />
                </div>
                <p className="mt-2 text-xs leading-snug text-foreground">{t("home.previewMock3Post")}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3 text-red-500" /> 42</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> 8</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const PROMISE_META = [
  { icon: Shield, accent: "from-[color:var(--brand-blue)] to-[color:var(--secondary)]", to: "/features" },
  { icon: Trophy, accent: "from-[color:var(--victory)] to-[color:var(--energy)]", to: "/register/player" },
  { icon: GraduationCap, accent: "from-[color:var(--primary)] to-[color:var(--brand-blue)]", to: "/register" },
] as const;

function Promises() {
  const { t } = useTranslation("marketing");

  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-6 lg:grid-cols-3">
          {PROMISE_META.map((p, i) => {
            const Icon = p.icon;
            const title = t(`home.promise${i + 1}Title`);
            const body = t(`home.promise${i + 1}Body`);
            const cta = t(`home.promise${i + 1}Cta`);
            return (
              <div
                key={title}
                className="group relative flex flex-col rounded-3xl border border-border bg-card p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-[color:var(--brand-blue)]/40"
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${p.accent} text-white shadow-md group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 font-display text-2xl font-bold tracking-tight">{title}</h3>
                <p className="mt-3 flex-1 text-base leading-relaxed text-muted-foreground">{body}</p>
                <Link
                  to={p.to}
                  className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                >
                  {cta}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
