import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, HeartHandshake, Upload, Sparkles, Clock, Users, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Display, SectionEyebrow, StadiumCard } from "@/components/marketing/stadium-ui";

export const Route = createFileRoute("/club-onboarding")({
  component: ClubOnboarding,
  head: () => ({
    meta: [
      { title: "Club onboarding — Switch to Clubero in days, not months" },
      { name: "description", content: "On vous accompagne à chaque étape : import des joueurs, parents, équipes, plannings. Onboarding personnalisé, humain, rassurant." },
      { property: "og:title", content: "Club onboarding — We migrate your club for you" },
      { property: "og:description", content: "Migration sereine, support humain, mise en place en quelques jours." },
    ],
    links: [{ rel: "canonical", href: "https://clubero.app/club-onboarding" }],
  }),
});

const STEPS = [
  { n: "01", t: "Appel découverte", d: "30 min avec notre équipe pour comprendre votre club, vos équipes, vos habitudes.", icon: HeartHandshake },
  { n: "02", t: "Import de vos données", d: "Joueurs, parents, équipes, plannings, contacts — on importe vos fichiers Excel, CSV ou exports.", icon: Upload },
  { n: "03", t: "Paramétrage personnalisé", d: "On configure votre branding, vos rôles, vos catégories. Vous découvrez votre Clubero, déjà prêt.", icon: Sparkles },
  { n: "04", t: "Formation express", d: "Une session pour vos dirigeants et coachs. Tout le monde est opérationnel en 1 h.", icon: Users },
  { n: "05", t: "Go live", d: "Vos joueurs et parents reçoivent leur invitation. Votre saison démarre sur Clubero.", icon: ShieldCheck },
];

const IMPORT_TYPES = [
  "Joueurs", "Parents", "Plannings", "Contacts", "Équipes", "Tournois", "Tableurs Excel/CSV", "Exports d'autres outils",
];

const FAQ = [
  { q: "Combien de temps prend la migration ?", a: "En moyenne 3 à 7 jours entre l'appel découverte et le go live. Pour les très gros clubs (500+ joueurs), comptez 2 semaines." },
  { q: "Et si je perds des données ?", a: "On garde tous vos fichiers source archivés. Chaque import est validé avec vous avant publication. Aucune donnée n'est jamais perdue." },
  { q: "Combien ça coûte ?", a: "L'onboarding et l'import sont inclus dans l'abonnement Clubero Club. Aucun frais caché." },
  { q: "Est-ce qu'on peut tester avant ?", a: "Oui — une démo personnalisée gratuite avec vos vraies données d'exemple, sur demande." },
];

function ClubOnboarding() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden border-b border-foreground/5">
        <div aria-hidden className="stadium-glow absolute inset-0" />
        <div className="relative mx-auto max-w-5xl px-5 py-24 text-center lg:px-8 lg:py-32">
          <SectionEyebrow>Club onboarding</SectionEyebrow>
          <Display as="h1">
            Switch to Clubero<br />in <span className="text-primary">days,</span> not months.
          </Display>
          <p className="mx-auto mt-8 max-w-2xl font-sans text-lg text-foreground/70">
            On vous accompagne à chaque étape. Vos données sont importées,
            votre équipe est formée, vos joueurs sont invités. Rassurant,
            humain, guidé.
          </p>
          <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-primary/30 bg-primary/10 px-5 py-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-primary">
              Mise en route moyenne : 3 à 7 jours
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
        <SectionEyebrow>The 5-step path</SectionEyebrow>
        <Display>Onboarding, étape par étape.</Display>
        <div className="mt-12 space-y-4">
          {STEPS.map((s) => (
            <StadiumCard key={s.n} className="p-6">
              <div className="flex gap-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-display text-2xl text-primary">
                  {s.n}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <s.icon className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-2xl uppercase">{s.t}</h3>
                  </div>
                  <p className="mt-2 font-sans text-sm text-foreground/70">{s.d}</p>
                </div>
              </div>
            </StadiumCard>
          ))}
        </div>
      </section>

      <section className="border-t border-foreground/5 bg-card/30 py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <SectionEyebrow>What we import for you</SectionEyebrow>
          <Display>Tout ce que vous avez. Repris.</Display>
          <p className="mt-4 max-w-2xl font-sans text-foreground/70">
            Tableurs Excel, fichiers CSV, exports d'autres outils — notre
            équipe s'occupe de tout. Vous nous envoyez vos fichiers, on
            vous rend votre club prêt à jouer.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {IMPORT_TYPES.map((t) => (
              <span key={t} className="rounded-full border border-foreground/10 bg-card px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-foreground/80">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <Display>Vos questions, nos réponses.</Display>
          <div className="mt-10 space-y-4">
            {FAQ.map((f) => (
              <StadiumCard key={f.q} className="p-6">
                <h4 className="font-display text-lg uppercase text-primary">{f.q}</h4>
                <p className="mt-2 font-sans text-sm text-foreground/70">{f.a}</p>
              </StadiumCard>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-foreground/5 py-24 text-center">
        <div className="mx-auto max-w-3xl px-5 lg:px-8">
          <Display>Parlons de votre club.</Display>
          <p className="mx-auto mt-6 max-w-xl font-sans text-foreground/70">
            30 minutes, sans engagement. On comprend votre fonctionnement,
            on vous montre comment Clubero s'y intègre.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="h-14 rounded-sm px-8 font-display text-base uppercase tracking-wider">
              <Link to="/demo">Book a discovery call <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-sm border-foreground/20 bg-card px-8 font-display text-base uppercase tracking-wider">
              <Link to="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
