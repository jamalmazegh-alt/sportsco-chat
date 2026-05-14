import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/faq")({
  component: FAQPage,
  head: () => ({
    meta: [
      { title: "FAQ — Clubero" },
      {
        name: "description",
        content:
          "Answers to common questions about Clubero — pricing, onboarding, GDPR, parental controls and more.",
      },
      { property: "og:title", content: "FAQ — Clubero" },
      { property: "og:description", content: "Answers to common questions about Clubero." },
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

const FAQS = [
  {
    q: "Who is Clubero for?",
    a: "Clubero is built for grassroots sports clubs — football, handball, basketball, rugby and more. Coaches, club admins, parents and players each get a tailored experience.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. Our Starter plan is free forever for one team of up to 25 members. You can upgrade to the Club plan when you need more teams or features.",
  },
  {
    q: "How long does it take to onboard a club?",
    a: "Most clubs are up and running in under an hour. We provide guided setup for the Club and Federation plans.",
  },
  {
    q: "How does Clubero handle minors and parental consent?",
    a: "Players under 18 can be linked to one or more parent accounts. Parents control responses and visibility on behalf of their child by default.",
  },
  {
    q: "Where is data stored?",
    a: "All club data is hosted on EU infrastructure and Clubero is GDPR-compliant. Members can request exports or deletion at any time.",
  },
  {
    q: "Can I import my existing roster?",
    a: "Yes. We support CSV imports during onboarding, and our team can help you migrate from spreadsheets or other tools.",
  },
  {
    q: "Does Clubero work on mobile?",
    a: "Clubero is mobile-first. It works in any modern browser and can be installed as a PWA on iOS and Android for a native-app experience.",
  },
  {
    q: "How do I get support?",
    a: "Email support is included on all plans. Club and Federation plans get priority support and dedicated onboarding.",
  },
];

function FAQPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            FAQ
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Frequently asked questions
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Can&apos;t find what you&apos;re looking for? Reach out — we&apos;re happy to help.
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
              <Link to="/contact">Contact us</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/demo">Request a demo</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
