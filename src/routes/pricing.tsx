import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — Clubero" },
      {
        name: "description",
        content:
          "Simple, club-friendly pricing. Start free, upgrade when your club grows.",
      },
      { property: "og:title", content: "Pricing — Clubero" },
      {
        property: "og:description",
        content: "Start free. Upgrade when your club grows.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/pricing" }],
  }),
});

const TIERS = [
  {
    name: "Starter",
    price: "Free",
    cadence: "forever",
    description: "Perfect for a single team trying Clubero.",
    cta: "Get started",
    href: "/register",
    highlight: false,
    features: [
      "1 team",
      "Up to 25 members",
      "Convocations & attendance",
      "Mobile app for all roles",
      "Email support",
    ],
  },
  {
    name: "Club",
    price: "€39",
    cadence: "per month",
    description: "For clubs running multiple teams.",
    cta: "Request a demo",
    href: "/demo",
    highlight: true,
    features: [
      "Unlimited teams",
      "Unlimited members",
      "Club-wide communication wall",
      "Attendance insights & exports",
      "Custom roles & permissions",
      "Priority support",
    ],
  },
  {
    name: "Federation",
    price: "Custom",
    cadence: "tailored",
    description: "Multi-club setups, federations and academies.",
    cta: "Contact sales",
    href: "/contact",
    highlight: false,
    features: [
      "Multi-club organization",
      "SSO & advanced security",
      "Dedicated onboarding",
      "Custom data exports",
      "SLA & training",
    ],
  },
];

function PricingPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            Pricing
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Simple pricing for every club.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Start free with one team. Upgrade when your club grows. No setup fees.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="grid gap-6 lg:grid-cols-3">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={`relative rounded-3xl border bg-card p-8 ${
                  t.highlight
                    ? "border-[color:var(--brand-blue)] shadow-xl shadow-[color:var(--brand-blue)]/10"
                    : "border-border"
                }`}
              >
                {t.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[color:var(--brand-blue-deep)] px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </div>
                )}
                <h2 className="font-display text-xl font-bold">{t.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-bold">{t.price}</span>
                  <span className="text-sm text-muted-foreground">{t.cadence}</span>
                </div>
                <Button
                  asChild
                  className="mt-6 w-full h-11"
                  variant={t.highlight ? "default" : "outline"}
                >
                  <Link to={t.href}>{t.cta}</Link>
                </Button>
                <ul className="mt-8 space-y-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            All plans include EU data hosting, GDPR compliance and unlimited
            convocations.
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
