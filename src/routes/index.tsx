import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isAppHost } from "@/lib/host";
import { Loader2, ArrowRight, CalendarCheck, Users, Bell, ShieldCheck, MessageSquareText, BarChart3, CheckCircle2 } from "lucide-react";
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
          "Clubero remplace le chaos WhatsApp par une appli claire pour les convocations, présences et communication de club. Pour clubs, coachs, parents et joueurs.",
      },
      { property: "og:title", content: "Clubero — La coordination d'équipe pour clubs sportifs" },
      {
        property: "og:description",
        content: "Convocations, présences, rappels. En un clic. Zéro chaos.",
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
      <ForEveryone />
      <CTA />
    </MarketingLayout>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--brand-blue) 18%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-5 pt-16 pb-12 lg:px-8 lg:pt-24 lg:pb-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Conçu pour les clubs sportifs amateurs
            </div>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              La coordination d&apos;équipe,{" "}
              <span className="text-[color:var(--brand-blue)]">simplifiée.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Arrêtez de courir après les parents sur WhatsApp. Clubero centralise
              les convocations, présences, communication et rappels — en un seul clic.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link to="/demo">
                  Demander une démo <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <Link to="/features">Voir les fonctionnalités</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Essai gratuit · Sans carte bancaire
            </p>
          </div>

          <div className="relative lg:col-span-5">
            <div className="relative mx-auto max-w-sm">
              <div
                className="absolute -inset-6 -z-10 rounded-[2.5rem] opacity-50 blur-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--brand-blue) 40%, transparent), color-mix(in oklab, var(--secondary) 40%, transparent))",
                }}
              />
              <div className="rounded-3xl border border-border bg-card p-5 shadow-2xl shadow-[color:var(--brand-blue-deep)]/10">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Samedi · 14:30
                    </p>
                    <p className="font-display text-base font-semibold">
                      U13 — Match vs FC Riverside
                    </p>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-[color:var(--secondary)]">
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
                  ].map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[color:var(--brand-blue)] to-[color:var(--secondary)] text-xs font-semibold text-white grid place-items-center">
                          {p.name[0]}
                        </div>
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.c}`}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>14 sur 18 ont répondu</span>
                  <span className="font-semibold text-foreground">78%</span>
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
  },
  {
    icon: Users,
    title: "Gestion d'équipe",
    body: "Effectifs, liens parents, numéros et postes — tout au même endroit.",
  },
  {
    icon: Bell,
    title: "Rappels automatiques",
    body: "Plus besoin de relancer. Les rappels partent tout seuls.",
  },
  {
    icon: MessageSquareText,
    title: "Communication de club",
    body: "Un mur propre et un chat par événement remplacent les groupes WhatsApp.",
  },
  {
    icon: BarChart3,
    title: "Suivi des présences",
    body: "Voyez qui est venu, qui a manqué, et repérez les tendances de la saison.",
  },
  {
    icon: ShieldCheck,
    title: "RGPD & sécurité",
    body: "Accès par rôle, contrôle parental et données hébergées en Europe.",
  },
];

function FeaturesGrid() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Tout ce dont votre club a besoin.
            <br />
            Rien de superflu.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Remplacez quatre groupes WhatsApp, deux tableurs et une feuille
            imprimée par une appli mobile-first, simple et claire.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)]">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
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
    points: ["Centralisez équipes et membres", "Tableau de bord multi-équipes", "Statistiques sur la saison"],
  },
  {
    title: "Coachs",
    points: ["Convocations en quelques secondes", "Présences en temps réel", "Chat dédié à chaque événement"],
  },
  {
    title: "Parents",
    points: ["Réponse en un clic", "Calendrier dans la poche", "Zéro surcharge de notifications"],
  },
  {
    title: "Joueurs",
    points: ["Voyez votre prochain match", "Confirmez votre présence", "Restez dans la boucle"],
  },
];

function ForEveryone() {
  return (
    <section className="border-b border-border/60 bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            Pour tout le club
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Une appli, quatre points de vue.
          </h2>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <div
              key={a.title}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <h3 className="font-display text-xl font-bold">{a.title}</h3>
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
  return (
    <section>
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div
          className="overflow-hidden rounded-3xl border border-border p-10 lg:p-16 text-center"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--brand-blue-deep) 95%, black), color-mix(in oklab, var(--brand-blue) 60%, transparent))",
          }}
        >
          <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Prêt à apporter du calme à votre club ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/80">
            Réservez une démo de 15 minutes. On configure votre première équipe avec vous.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 bg-white text-[color:var(--brand-blue-deep)] hover:bg-white/90">
              <Link to="/demo">Demander une démo</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to="/pricing">Voir les tarifs</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
