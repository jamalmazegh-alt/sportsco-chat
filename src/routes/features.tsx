import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, Users, Bell, ShieldCheck, MessageSquareText, BarChart3, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/features")({
  component: FeaturesPage,
  head: () => ({
    meta: [
      { title: "Features — Clubero" },
      {
        name: "description",
        content:
          "Convocations, attendance, communication, insights. Discover everything Clubero does for clubs, coaches, parents and players.",
      },
      { property: "og:title", content: "Features — Clubero" },
      {
        property: "og:description",
        content: "Everything your club needs. Nothing it doesn't.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/features" }],
  }),
});

const PILLARS = [
  {
    icon: CalendarCheck,
    title: "Convocations & Events",
    body: "Create matches, training and tournaments in seconds. Convocations reach the right players and parents instantly.",
  },
  {
    icon: Users,
    title: "Team & Roster",
    body: "Manage players, jersey numbers, positions and parent links. Photo, birth date, contact — all in one card.",
  },
  {
    icon: Bell,
    title: "Reminders",
    body: "Automatic nudges follow up on missing responses so coaches don't have to.",
  },
  {
    icon: MessageSquareText,
    title: "Communication",
    body: "Club-wide wall, team posts, and event-level chat keep conversation focused, not scattered.",
  },
  {
    icon: BarChart3,
    title: "Attendance Tracking",
    body: "Mark presence in one tap. See trends per player and per team across the season.",
  },
  {
    icon: ShieldCheck,
    title: "Roles & Permissions",
    body: "Admins, coaches, players and parents each see exactly what they need — and nothing more.",
  },
];

const AUDIENCES = [
  {
    title: "For Clubs",
    color: "var(--brand-blue-deep)",
    points: [
      "Multi-team dashboard with key metrics",
      "Member directory and role management",
      "Centralized communication channel",
      "Season-wide attendance reporting",
      "GDPR-ready, EU data hosting",
    ],
  },
  {
    title: "For Coaches",
    color: "var(--brand-blue)",
    points: [
      "Build a convocation in under a minute",
      "Real-time attendance responses",
      "Event-level chat with players & parents",
      "Reusable templates for recurring training",
      "Substitute management & jersey assignment",
    ],
  },
  {
    title: "For Parents",
    color: "var(--secondary)",
    points: [
      "One tap to confirm or decline",
      "Family calendar with all your kids' events",
      "Zero spammy group chats",
      "Direct messaging with the coach",
      "Manage permissions on behalf of minors",
    ],
  },
  {
    title: "For Players",
    color: "var(--primary)",
    points: [
      "See your next match at a glance",
      "Quick attendance confirmation",
      "Team chat without the noise",
      "Personal attendance history",
      "Profile, photo and stats",
    ],
  },
];

function FeaturesPage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            Features
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            One app for the whole season.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            From the first convocation to the end-of-season report — Clubero
            covers what matters for grassroots clubs.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 font-display text-lg font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/20">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Built for every role in the club.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Each user gets a focused experience tailored to what they need.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="rounded-3xl border border-border bg-card p-8">
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                  <h3 className="font-display text-2xl font-bold">{a.title}</h3>
                </div>
                <ul className="mt-6 space-y-3">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-foreground/80">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-16 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6">
              <Link to="/demo">
                Request a demo <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
