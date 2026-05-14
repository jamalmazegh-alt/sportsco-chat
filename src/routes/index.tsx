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
      { title: "Clubero — Team coordination for sports clubs" },
      {
        name: "description",
        content:
          "Clubero replaces WhatsApp chaos with a clean app for convocations, attendance and club communication. Built for clubs, coaches, parents and players.",
      },
      { property: "og:title", content: "Clubero — Team coordination for sports clubs" },
      {
        property: "og:description",
        content: "Convocations, attendance, reminders. One tap. Zero chaos.",
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
    // SSR / first paint: render marketing landing.
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
      <Logos />
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
              Built for grassroots sports clubs
            </div>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Team coordination,{" "}
              <span className="text-[color:var(--brand-blue)]">made simple.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Stop chasing parents in WhatsApp. Clubero gives clubs a single place
              for convocations, attendance, communication and reminders — in one tap.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link to="/demo">
                  Request a demo <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <Link to="/features">See features</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free to try · No credit card required
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
                      Saturday · 14:30
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
                    { name: "Lucas M.", status: "Present", c: "bg-primary/15 text-[color:var(--secondary)]" },
                    { name: "Emma D.", status: "Present", c: "bg-primary/15 text-[color:var(--secondary)]" },
                    { name: "Noah B.", status: "Maybe", c: "bg-amber-500/15 text-amber-700" },
                    { name: "Léa S.", status: "Absent", c: "bg-red-500/15 text-red-700" },
                    { name: "Adam K.", status: "Pending", c: "bg-muted text-muted-foreground" },
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
                  <span>14 of 18 responded</span>
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

function Logos() {
  return (
    <section className="border-b border-border/60 bg-muted/30">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Trusted by clubs across Europe
        </p>
        <div className="mt-6 grid grid-cols-2 gap-6 opacity-60 sm:grid-cols-3 md:grid-cols-6">
          {["AS Marigny", "FC Riverside", "USAG Uckange", "PSG Académie", "OL Junior", "Stade Rennais"].map((c) => (
            <div key={c} className="text-center font-display text-sm font-semibold text-muted-foreground">
              {c}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Smart convocations",
    body: "Send convocations in seconds. Players and parents respond in one tap.",
  },
  {
    icon: Users,
    title: "Team management",
    body: "Manage rosters, parent links, jersey numbers and positions in one place.",
  },
  {
    icon: Bell,
    title: "Automated reminders",
    body: "Never chase a response again. Reminders go out automatically.",
  },
  {
    icon: MessageSquareText,
    title: "Club communication",
    body: "A clean wall and event-level chat replace messy group chats.",
  },
  {
    icon: BarChart3,
    title: "Attendance insights",
    body: "Track who showed up, who didn't, and spot patterns over the season.",
  },
  {
    icon: ShieldCheck,
    title: "GDPR-ready & safe",
    body: "Role-based access, parental controls and data hosted in the EU.",
  },
];

function FeaturesGrid() {
  return (
    <section className="border-b border-border/60">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything your club needs.
            <br />
            Nothing it doesn&apos;t.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Replace four group chats, two spreadsheets and a printed roster with one
            simple, mobile-first app.
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
    points: ["Centralize teams and members", "Multi-team dashboard", "Season-wide insights"],
  },
  {
    title: "Coaches",
    points: ["Send convocations in seconds", "Live attendance tracking", "Event-level chat"],
  },
  {
    title: "Parents",
    points: ["Respond in one tap", "Calendar in your pocket", "Zero notification overload"],
  },
  {
    title: "Players",
    points: ["See your next match", "Confirm attendance", "Stay in the loop"],
  },
];

function ForEveryone() {
  return (
    <section className="border-b border-border/60 bg-muted/20">
      <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            For everyone in the club
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            One app, four perspectives.
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
            Ready to bring calm to your club?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/80">
            Book a 15-minute demo. We&apos;ll set up your first team with you.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 bg-white text-[color:var(--brand-blue-deep)] hover:bg-white/90">
              <Link to="/demo">Request a demo</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
