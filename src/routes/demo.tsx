import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
  head: () => ({
    meta: [
      { title: "Request a demo — Clubero" },
      {
        name: "description",
        content:
          "Book a 15-minute walkthrough of Clubero. We'll set up your first team with you.",
      },
      { property: "og:title", content: "Request a demo — Clubero" },
      {
        property: "og:description",
        content: "Book a 15-minute walkthrough of Clubero.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/demo" }],
  }),
});

function DemoPage() {
  const [club, setClub] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [teams, setTeams] = useState("");
  const [notes, setNotes] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = `Demo request — ${club}`;
    const body = `Club: ${club}\nContact: ${name} <${email}>\nRole: ${role}\nTeams: ${teams}\n\nNotes:\n${notes}`;
    window.location.href = `mailto:hello@clubero.app?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }

  const PERKS = [
    "15-minute personalized walkthrough",
    "We set up your first team with you",
    "Free trial, no credit card required",
    "Migration help from your current tool",
  ];

  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
              Demo
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              See Clubero in action.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Tell us a bit about your club — we&apos;ll reach out within one
              business day to schedule a walkthrough.
            </p>
            <ul className="mt-8 space-y-3">
              {PERKS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-foreground/80">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-[color:var(--brand-blue)]/5 lg:p-8"
          >
            <div className="space-y-1.5">
              <Label htmlFor="d-club">Club name</Label>
              <Input
                id="d-club"
                required
                value={club}
                onChange={(e) => setClub(e.target.value)}
                placeholder="AS Riverside"
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="d-name">Your name</Label>
                <Input
                  id="d-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-email">Email</Label>
                <Input
                  id="d-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@club.com"
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="d-role">Your role</Label>
                <Input
                  id="d-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Coach, Admin…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="d-teams">Number of teams</Label>
                <Input
                  id="d-teams"
                  value={teams}
                  onChange={(e) => setTeams(e.target.value)}
                  placeholder="e.g. 6"
                />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="d-notes">Anything we should know?</Label>
              <Textarea
                id="d-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Current tool, biggest pain point…"
              />
            </div>
            <Button type="submit" size="lg" className="mt-6 w-full h-12">
              Request a demo
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              We&apos;ll never share your details. GDPR-compliant.
            </p>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}
