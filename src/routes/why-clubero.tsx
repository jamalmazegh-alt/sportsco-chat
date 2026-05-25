import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Display, SectionEyebrow, StadiumCard } from "@/components/marketing/stadium-ui";

export const Route = createFileRoute("/why-clubero")({
  component: WhyClubero,
  head: () => ({
    meta: [
      { title: "Why Clubero — Modern OS for amateur sports" },
      { name: "description", content: "Comparez l'ancien monde (WhatsApp, Excel, outils dispersés) à Clubero : une plateforme moderne, mobile-first et communautaire pour le sport amateur." },
      { property: "og:title", content: "Why Clubero — The modern OS for amateur sports" },
      { property: "og:description", content: "L'ancien monde vs Clubero : voyez la différence." },
    ],
    links: [{ rel: "canonical", href: "https://clubero.app/why-clubero" }],
  }),
});

const OLD_WAY = [
  "Chaos WhatsApp (groupes, messages perdus)",
  "Tournois sur Excel, mise à jour manuelle",
  "Outils dispersés, données silotées",
  "UX desktop, pensée pour l'admin",
  "Aucune expérience live pour les supporters",
  "Pas de communauté, juste de la logistique",
];

const NEW_WAY = [
  "Communication unifiée — annonces, mur, chat",
  "Plateforme tournoi live, brackets auto",
  "Tout connecté : club, joueurs, parents, tournois",
  "Mobile-first, premium, pensé pour le terrain",
  "Pages publiques, TV slideshow, scores live",
  "Communauté vivante : MVP, réactions, photos",
];

function WhyClubero() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden border-b border-foreground/5">
        <div aria-hidden className="stadium-glow absolute inset-0" />
        <div className="relative mx-auto max-w-4xl px-5 py-24 text-center lg:px-8 lg:py-32">
          <SectionEyebrow>Why Clubero</SectionEyebrow>
          <Display as="h1">
            The old way is <span className="text-foreground/30">tired.</span>
            <br />
            Welcome to the <span className="text-primary">new game.</span>
          </Display>
          <p className="mx-auto mt-8 max-w-2xl font-sans text-lg text-foreground/70">
            Le sport amateur mérite mieux qu'un tableur partagé et trois
            groupes WhatsApp. Clubero réinvente l'expérience — du dirigeant
            au supporter.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <StadiumCard className="p-8">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-foreground/40">
              The old way
            </p>
            <h3 className="mt-2 font-display text-3xl uppercase text-foreground/60">
              Outils d'avant
            </h3>
            <ul className="mt-8 space-y-4">
              {OLD_WAY.map((item) => (
                <li key={item} className="flex items-start gap-3 font-sans text-sm text-foreground/60">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-foreground/30" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </StadiumCard>

          <StadiumCard glow className="border-primary/30 bg-card p-8">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
              The Clubero way
            </p>
            <h3 className="mt-2 font-display text-3xl uppercase">Sport amateur, ré-inventé</h3>
            <ul className="mt-8 space-y-4">
              {NEW_WAY.map((item) => (
                <li key={item} className="flex items-start gap-3 font-sans text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </StadiumCard>
        </div>
      </section>

      <section className="border-t border-foreground/5 bg-card/30 py-24">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <SectionEyebrow>Our philosophy</SectionEyebrow>
          <Display>Mobile-first. Live-first. Community-first.</Display>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              { t: "Mobile-first", d: "Chaque écran pensé pour la poche, pas pour le bureau. Le terrain n'attend pas." },
              { t: "Live-first", d: "Scores, brackets, classements en temps réel. Le sport est vivant — votre plateforme aussi." },
              { t: "Community-first", d: "Joueurs, parents, supporters, dirigeants — tout le monde vibre ensemble." },
            ].map((p) => (
              <StadiumCard key={p.t} className="p-6">
                <h4 className="font-display text-xl uppercase text-primary">{p.t}</h4>
                <p className="mt-3 font-sans text-sm text-foreground/70">{p.d}</p>
              </StadiumCard>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 text-center">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <Display>Ready to leave the old way behind?</Display>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-14 rounded-sm px-8 font-display text-base uppercase tracking-wider">
              <Link to="/register">Create your club <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-sm border-foreground/20 bg-card px-8 font-display text-base uppercase tracking-wider">
              <Link to="/club-onboarding">See onboarding</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
