import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

const FAQS = [
  {
    q: "À qui s'adresse Clubero ?",
    a: "Clubero est conçu pour les clubs sportifs amateurs. Coachs, dirigeants, parents et joueurs ont chacun une expérience adaptée.",
  },
  {
    q: "Quels sports sont couverts ?",
    a: "En V1, Clubero couvre 7 sports collectifs avec une saisie de score et des statistiques joueurs adaptées au sport : football, futsal, basketball, rugby, handball, volley-ball et hockey sur glace. D'autres sports arriveront ensuite — dites-nous lequel vous manque.",
  },
  {
    q: "Y a-t-il une offre gratuite ?",
    a: "Oui. Notre offre Découverte est gratuite à vie pour une équipe jusqu'à 25 membres. Vous pouvez passer au plan Club quand vous avez besoin de plus d'équipes ou de fonctionnalités.",
  },
  {
    q: "Combien de temps pour mettre en place un club ?",
    a: "La plupart des clubs sont opérationnels en moins d'une heure. Un accompagnement guidé est inclus avec les offres Club et Fédération.",
  },
  {
    q: "Comment gérez-vous les mineurs et le consentement parental ?",
    a: "Les joueurs de moins de 18 ans peuvent être liés à un ou plusieurs comptes parents. Par défaut, les parents contrôlent les réponses et la visibilité au nom de leur enfant.",
  },
  {
    q: "Où sont stockées les données ?",
    a: "Toutes les données du club sont hébergées sur une infrastructure européenne et Clubero est conforme au RGPD. Les membres peuvent demander un export ou une suppression à tout moment.",
  },
  {
    q: "Puis-je importer mon effectif existant ?",
    a: "Oui. Nous gérons l'import CSV pendant l'onboarding, et notre équipe peut vous aider à migrer depuis vos tableurs ou autres outils.",
  },
  {
    q: "Clubero fonctionne-t-il sur mobile ?",
    a: "Clubero est mobile-first. Il fonctionne dans tout navigateur moderne et peut être installé en PWA sur iOS et Android pour une expérience native.",
  },
  {
    q: "Comment obtenir de l'aide ?",
    a: "Le support par e-mail est inclus dans toutes les offres. Les plans Club et Fédération bénéficient d'un support prioritaire et d'un onboarding dédié.",
  },
];

export const Route = createFileRoute("/faq")({
  component: FAQPage,
  head: () => ({
    meta: [
      { title: "FAQ — Clubero" },
      {
        name: "description",
        content:
          "Réponses aux questions fréquentes sur Clubero — tarifs, mise en place, RGPD, contrôle parental et plus.",
      },
      { property: "og:title", content: "FAQ — Clubero" },
      { property: "og:description", content: "Réponses aux questions fréquentes sur Clubero." },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/faq" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
});

function FAQPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            FAQ
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Questions fréquentes
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Vous ne trouvez pas votre réponse ? Contactez-nous, nous serons ravis d&apos;aider.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left font-display text-base font-semibold">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-14 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/contact">Nous contacter</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/demo">Demander une démo</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
