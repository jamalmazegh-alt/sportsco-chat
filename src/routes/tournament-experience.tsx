import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Trophy, Tv, QrCode, Smartphone, ListOrdered, Share2, Users, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Display, SectionEyebrow, StadiumCard, LivePill, ScoreBadge } from "@/components/marketing/stadium-ui";

export const Route = createFileRoute("/tournament-experience")({
  component: TournamentExperience,
  head: () => ({
    meta: [
      { title: "Tournament Experience — Live brackets, scores, public pages" },
      { name: "description", content: "Vivez vos tournois comme un événement pro : brackets live, scoring mobile, TV slideshow, QR codes, pages publiques, classements en temps réel." },
      { property: "og:title", content: "Live tournament experience — Clubero" },
      { property: "og:description", content: "Vos tournois méritent l'expérience d'un événement pro." },
    ],
    links: [{ rel: "canonical", href: "https://clubero.app/tournament-experience" }],
  }),
});

const FEATURES = [
  { icon: Trophy, t: "Création express", d: "Format en quelques clics : poules, élimination directe, round-robin. Brackets auto-générés." },
  { icon: PlayCircle, t: "Scoring mobile", d: "Les arbitres saisissent les scores depuis leur téléphone. Classements mis à jour en temps réel." },
  { icon: ListOrdered, t: "Classements live", d: "Standings publics qui s'actualisent à chaque match terminé. Aucun rafraîchissement nécessaire." },
  { icon: Tv, t: "TV slideshow", d: "Branchez un grand écran sur place : brackets, scores et prochains matchs en boucle." },
  { icon: QrCode, t: "QR code spectateurs", d: "Un QR sur l'affiche, un scan, et tout le public suit le tournoi en direct sur son téléphone." },
  { icon: Share2, t: "Pages publiques", d: "Un lien à partager — la presse, les familles, les sponsors voient tout, sans inscription." },
  { icon: Smartphone, t: "Outils arbitre", d: "Cartons, prolongations, tirs au but : tout est prévu, sur mobile, sans formulaire moche." },
  { icon: Users, t: "Inscriptions en ligne", d: "Joueurs et équipes s'inscrivent eux-mêmes. Paiements et confirmations automatiques." },
];

function TournamentExperience() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden border-b border-foreground/5">
        <div aria-hidden className="stadium-glow absolute inset-0" />
        <div className="relative mx-auto max-w-5xl px-5 py-24 text-center lg:px-8 lg:py-32">
          <LivePill>Now playing · Live tournament</LivePill>
          <Display as="h1" className="mt-8">
            Run tournaments<br />like a <span className="text-primary">pro event.</span>
          </Display>
          <p className="mx-auto mt-8 max-w-2xl font-sans text-lg text-foreground/70">
            Brackets live, scoring mobile, classements publics, TV slideshow,
            QR codes pour le public. L'expérience d'un événement pro — pour
            n'importe quel club.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-14 rounded-sm px-8 font-display text-base uppercase tracking-wider">
              <Link to="/tournaments/start">Start a tournament <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-sm border-foreground/20 bg-card px-8 font-display text-base uppercase tracking-wider">
              <Link to="/demo">Watch demo</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
        <StadiumCard glow className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-foreground/5 bg-card/50 p-4">
            <div className="flex items-center gap-3">
              <span className="rounded-sm bg-primary px-2 py-0.5 font-sans text-[10px] font-bold uppercase text-primary-foreground">LIVE</span>
              <span className="font-sans text-xs font-semibold uppercase tracking-widest text-foreground/60">U13 Easter Cup · Final</span>
            </div>
            <ScoreBadge minute="64' played" />
          </div>
          <div className="grid items-center gap-6 p-10 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto h-20 w-20 rounded-full border border-foreground/10 bg-background" />
              <p className="mt-3 font-display text-xl uppercase tracking-wider">Riverside</p>
            </div>
            <div className="text-center font-display text-7xl tabular-nums sm:text-8xl">
              2 <span className="text-foreground/15">—</span> <span className="text-primary">1</span>
            </div>
            <div className="text-center">
              <div className="mx-auto h-20 w-20 rounded-full border border-foreground/10 bg-background" />
              <p className="mt-3 font-display text-xl uppercase tracking-wider">AS Montagne</p>
            </div>
          </div>
          <div className="border-t border-foreground/5 p-4">
            <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-foreground/40">Recent events</p>
            <div className="flex gap-3 overflow-x-auto">
              {[
                { t: "61' Goal", n: "Lucas M.", c: "text-primary" },
                { t: "55' Yellow card", n: "Adam K.", c: "text-yellow-500" },
                { t: "49' Save", n: "Emma D.", c: "text-primary" },
                { t: "32' Goal", n: "Léa S.", c: "text-primary" },
              ].map((e) => (
                <div key={e.t} className="min-w-[150px] rounded border border-foreground/5 bg-background p-2">
                  <p className={`font-sans text-[10px] font-bold uppercase ${e.c}`}>{e.t}</p>
                  <p className="font-sans text-xs font-medium">{e.n}</p>
                </div>
              ))}
            </div>
          </div>
        </StadiumCard>
      </section>

      <section className="border-t border-foreground/5 bg-card/30 py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mb-12 max-w-2xl">
            <SectionEyebrow>Everything a tournament needs</SectionEyebrow>
            <Display>One platform. End-to-end.</Display>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <StadiumCard key={f.t} className="p-6">
                <f.icon className="h-5 w-5 text-primary" />
                <h4 className="mt-4 font-display text-xl uppercase">{f.t}</h4>
                <p className="mt-2 font-sans text-sm text-foreground/60">{f.d}</p>
              </StadiumCard>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 text-center">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <Display>Your next tournament,<br />live in minutes.</Display>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-14 rounded-sm px-8 font-display text-base uppercase tracking-wider">
              <Link to="/tournaments/start">Start now <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-sm border-foreground/20 bg-card px-8 font-display text-base uppercase tracking-wider">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
