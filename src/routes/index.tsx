import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { isAppHost } from "@/lib/host";
import {
  Loader2, ArrowRight, CalendarCheck, Users, Bell, ShieldCheck,
  MessageSquareText, BarChart3, CheckCircle2, Trophy, Zap, Activity, Flame, MessageCircle, Sparkles, BrainCircuit, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Clubero — La coordination d'équipe pour clubs sportifs" },
      {
        name: "description",
        content:
          "Clubero structure vos convocations, présences et communication de club en un seul outil. Pour clubs, coachs, parents et joueurs. WhatsApp reste disponible en option si besoin.",
      },
      { property: "og:title", content: "Clubero — La coordination d'équipe pour clubs sportifs" },
      {
        property: "og:description",
        content: "Convocations, présences, rappels — tout dans un seul outil. En un clic.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/" }],
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
      <Hero />
      <FeaturesGrid />
      <WhatsAppHybrid />
      <AIAssistantSection />
      <ForEveryone />
      <CTA />
    </MarketingLayout>
  );
}

function WhatsAppHybrid() {
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-gradient-to-br from-[#25D366]/5 via-background to-[#075E54]/5">
      <div
        aria-hidden
        className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#25D366]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#075E54]/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <MessageCircle className="h-3.5 w-3.5" />
              Communication flexible
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Tout le monde reçoit.
              <br />
              Même ceux qui préfèrent <span className="text-[#25D366]">WhatsApp</span>.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Clubero centralise vos convocations, présences et rappels dans un seul outil.
              Si certains parents ou joueurs préfèrent rester sur WhatsApp, vous pouvez
              partager le message formaté directement dans le groupe en un clic.
            </p>

            <ul className="mt-7 space-y-3">
              {[
                {
                  t: "Convocations centralisées dans Clubero",
                  d: "C'est dans l'appli que tout se passe : convocations, réponses de présence, rappels et chat par événement.",
                },
                {
                  t: "WhatsApp en option",
                  d: "Besoin de toucher ceux qui n'utilisent pas encore l'appli ? Un bouton copie le message formaté prêt à partager dans WhatsApp.",
                },
                {
                  t: "Email pour les résistants au téléphone",
                  d: "Les convocations peuvent aussi partir par email. Vous couvrez tous les canaux sans effort.",
                },
                {
                  t: "Aucune API, aucun numéro à configurer",
                  d: "Le partage WhatsApp utilise le natif du téléphone. Rien à installer côté club.",
                },
              ].map((p) => (
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
              <Button
                asChild
                size="lg"
                className="h-12 px-6 shadow-elevated"
              >
                <Link to="/demo">
                  Voir la démo <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                Clubero en priorité — WhatsApp et email en option
              </span>
            </div>
          </div>

          {/* WhatsApp preview mock */}
          <div className="lg:col-span-6">
            <div className="relative mx-auto max-w-md">
              <div
                aria-hidden
                className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-50 blur-3xl"
                style={{
                  background:
                    "linear-gradient(135deg, #25D36680, #075E5460)",
                }}
              />
              <div className="rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
                {/* WhatsApp-like header */}
                <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-sm font-bold">
                    U13
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">U13 — Saison 25/26</p>
                    <p className="text-[11px] text-white/70">Coach, 14 joueurs, 9 parents</p>
                  </div>
                  <MessageCircle className="h-4 w-4 text-white/80" />
                </div>

                {/* Message bubble */}
                <div className="bg-[#ECE5DD] px-4 py-5">
                  <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2.5 shadow-sm">
                    <p className="text-[13px] leading-relaxed text-[#111]">
                      ⚽ <strong>U13 vs FC Riverside</strong>
                      <br />
                      <em className="text-[12px] text-[#333]">FC Clubero · U13</em>
                      <br />
                      🏅 Championnat · 🏠 Domicile
                      <br />
                      <br />
                      📅 samedi 24 mai à 14h30
                      <br />
                      ⏰ Convocation : 13h45
                      <br />
                      📍 Stade Municipal
                      <br />
                      <br />
                      👥 <strong>Convoqués (12)</strong>
                      <br />
                      • Lucas M. • Emma D. • Noah B.
                      <br />
                      • Léa S. • Adam K. • Hugo P.
                      <br />
                      <span className="text-[#555]">+ 6 autres</span>
                      <br />
                      <br />
                      <span className="text-[11px] text-[#666]">— envoyé via Clubero</span>
                    </p>
                    <p className="mt-1 text-right text-[10px] text-[#888]">14:32 ✓✓</p>
                  </div>
                </div>

                {/* "From Clubero" footer strip */}
                <div className="flex items-center justify-between border-t border-border bg-card px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Zap className="h-3 w-3 text-[color:var(--energy)]" />
                    Envoyé en 12s depuis Clubero
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#25D366]">
                    WhatsApp
                  </span>
                </div>
              </div>

              {/* Floating "tracking" pill */}
              <div className="absolute -bottom-4 -left-4 z-10 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-elevated">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-primary text-white">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Présences suivies
                  </p>
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

function AIAssistantSection() {
  return (
    <section className="relative border-b border-border/60 overflow-hidden bg-muted/20">
      <div aria-hidden className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[color:var(--primary)]/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[color:var(--brand-blue)]/15 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          {/* Chat preview mock */}
          <div className="lg:col-span-6 order-2 lg:order-1">
            <div className="relative mx-auto max-w-md">
              <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-50 blur-3xl bg-gradient-primary" />
              <div className="rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
                <div className="flex items-center gap-3 bg-gradient-primary px-4 py-3 text-white">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20">
                    <BrainCircuit className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Assistant Clubero</p>
                    <p className="text-[11px] text-white/80">connecté à votre club</p>
                  </div>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">IA</span>
                </div>

                <div className="space-y-3 bg-background px-4 py-5">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground shadow-sm">
                      Qui n'a pas encore répondu pour samedi ?
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[13px] leading-relaxed text-foreground">
                      Pour <strong>U13 vs FC Riverside</strong> samedi 14h30, il manque encore <strong>3 réponses</strong> :
                    </p>
                    <div className="space-y-1.5">
                      {["Adam K.", "Sofiane R.", "Tom L."].map((n) => (
                        <div key={n} className="flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-1.5">
                          <span className="text-xs font-medium">{n}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">En attente</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[13px] leading-relaxed text-foreground">Veux-tu que je leur envoie un rappel ?</p>
                  </div>

                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground shadow-sm">
                      Oui, vas-y 👍
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2.5">
                  <div className="flex-1 rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">Pose ta question...</div>
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Send className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>

              <div className="absolute -top-4 -left-4 z-10 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-elevated">
                <Sparkles className="h-3.5 w-3.5 text-[color:var(--energy)]" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Contextuel</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--primary)]/30 bg-[color:var(--primary)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
              <BrainCircuit className="h-3.5 w-3.5" />
              Nouveau · Assistant IA
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Un <span className="text-gradient-primary">assistant</span> qui connaît votre club.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Posez vos questions en français. L'assistant lit vos données en temps réel — convocations, présences, stats joueurs, prochains événements — et vous répond instantanément.
            </p>

            <ul className="mt-7 space-y-3">
              {[
                { t: "Connecté à vos données", d: "« Qui manque samedi ? », « Quelle est ma moyenne de présence ? », « Mon prochain match ? »" },
                { t: "Adapté à votre rôle", d: "Coach, parent, joueur ou admin — l'assistant respecte ce que vous avez le droit de voir." },
                { t: "Aussi sur le site vitrine", d: "Le widget en bas à droite répond aux questions sur le produit, les tarifs et le process de démo, 24/7." },
                { t: "Hébergé en Europe", d: "Vos conversations ne servent pas à entraîner un modèle. Conforme RGPD." },
              ].map((p) => (
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
                <Link to="/demo">Essayer l'assistant <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <span className="text-xs text-muted-foreground">Inclus dans tous les plans · Aucun setup</span>
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
              {t("home.badge")}
            </div>
            <h1 className="mt-5 font-display text-[2.5rem] font-bold leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              {t("home.title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t("home.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base shadow-elevated hover:shadow-glow transition-shadow">
                <Link to="/demo">
                  {t("home.ctaDemo")} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <Link to="/features">{t("home.ctaFeatures")}</Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.freeTrial")}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.noCard")}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.hostedEU")}</span>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4 max-w-lg">
              {[
                { v: "12s", l: t("home.statConvoke") },
                { v: "+78%", l: t("home.statResponse") },
                { v: "0", l: t("home.statWhatsApp") },
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
                    Convocation
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Lucas M.", status: "Présent", c: "bg-primary/15 text-[color:var(--secondary)]" },
                    { name: "Emma D.", status: "Présent", c: "bg-primary/15 text-[color:var(--secondary)]" },
                    { name: "Noah B.", status: "Peut-être", c: "bg-amber-500/15 text-amber-700" },
                    { name: "Léa S.", status: "Absent", c: "bg-red-500/15 text-red-700" },
                    { name: "Adam K.", status: "En attente", c: "bg-muted text-muted-foreground" },
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
                  <span className="text-xs text-muted-foreground">14 sur 18 ont répondu</span>
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

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Convocations intelligentes",
    body: "Envoyez vos convocations en quelques secondes. Joueurs et parents répondent en un clic.",
    accent: "from-[color:var(--brand-blue)] to-[color:var(--secondary)]",
  },
  {
    icon: Users,
    title: "Gestion d'équipe",
    body: "Effectifs, liens parents, numéros et postes — tout au même endroit.",
    accent: "from-[color:var(--primary)] to-[color:var(--brand-blue)]",
  },
  {
    icon: Bell,
    title: "Rappels automatiques",
    body: "Plus besoin de relancer. Les rappels partent tout seuls.",
    accent: "from-[color:var(--energy)] to-[color:var(--victory)]",
  },
  {
    icon: MessageSquareText,
    title: "Compatible WhatsApp",
    body: "Gardez votre groupe WhatsApp pour discuter. Clubero envoie les convocations groupées directement dedans, en un clic.",
    accent: "from-[#25D366] to-[#075E54]",
  },
  {
    icon: Trophy,
    title: "Résultats & stats par sport",
    body: "Saisissez le score et les statistiques (buts, essais, paniers à 3 pts) adaptées à chaque sport.",
    accent: "from-[color:var(--victory)] to-[color:var(--energy)]",
  },
  {
    icon: BarChart3,
    title: "Suivi des présences",
    body: "Voyez qui est venu, qui a manqué, et repérez les tendances de la saison.",
    accent: "from-[color:var(--primary)] to-[color:var(--victory)]",
  },
  {
    icon: BrainCircuit,
    title: "Assistant IA intégré",
    body: "Posez vos questions en français — l'assistant connaît votre club, vos équipes, vos stats et vos prochains événements.",
    accent: "from-[color:var(--primary)] to-[color:var(--brand-blue)]",
  },
  {
    icon: Activity,
    title: "Activité du club en direct",
    body: "Mur, mentions, accusés de lecture, fichiers — toute la vie du club au même endroit.",
    accent: "from-[color:var(--brand-blue)] to-[color:var(--energy)]",
  },
  {
    icon: ShieldCheck,
    title: "RGPD & sécurité",
    body: "Accès par rôle, contrôle parental et données hébergées en Europe.",
    accent: "from-[color:var(--secondary)] to-[color:var(--primary)]",
  },
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
            Pensé pour les terrains
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
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated hover:border-[color:var(--brand-blue)]/40"
            >
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--brand-blue)]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
              />
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.accent} text-white shadow-md group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const AUDIENCES = [
  {
    title: "Clubs",
    icon: Trophy,
    points: ["Centralisez équipes et membres", "Tableau de bord multi-équipes", "Statistiques sur la saison"],
  },
  {
    title: "Coachs",
    icon: Zap,
    points: ["Convocations en quelques secondes", "Présences en temps réel", "Chat dédié à chaque événement"],
  },
  {
    title: "Parents",
    icon: Bell,
    points: ["Réponse en un clic", "Calendrier dans la poche", "Zéro surcharge de notifications"],
  },
  {
    title: "Joueurs",
    icon: Activity,
    points: ["Voyez votre prochain match", "Confirmez votre présence", "Restez dans la boucle"],
  },
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
          {AUDIENCES.map((a) => (
            <div
              key={a.title}
              className="group relative rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-elevated"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary text-white shadow-sm group-hover:scale-110 transition-transform">
                  <a.icon className="h-4 w-4" />
                </div>
                <h3 className="font-display text-xl font-bold">{a.title}</h3>
              </div>
              <ul className="mt-4 space-y-2.5">
                {a.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
              {t("home.ctaTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/80">
              {t("home.ctaBody")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 bg-white text-[color:var(--brand-blue-deep)] hover:bg-white/90 hover:scale-105 transition-transform shadow-lg">
                <Link to="/demo">{t("home.ctaButton")} <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link to="/pricing">{t("home.ctaPricing")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
