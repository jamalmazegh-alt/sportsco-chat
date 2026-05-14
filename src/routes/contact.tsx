import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact — Clubero" },
      { name: "description", content: "Contactez l'équipe Clubero." },
      { property: "og:title", content: "Contact — Clubero" },
      { property: "og:description", content: "Contactez l'équipe Clubero." },
    ],
    links: [{ rel: "canonical", href: "https://www.clubero.app/contact" }],
  }),
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = `Contact Clubero — ${name}`;
    const body = `De : ${name} <${email}>\n\n${message}`;
    window.location.href = `mailto:hello@clubero.app?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            Contact
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Discutons.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Question, partenariat ou simple curiosité ? Écrivez-nous.
          </p>
        </div>
      </section>

      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-3 lg:px-8 lg:py-20">
          <div className="lg:col-span-1">
            <div className="space-y-6">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)]">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-display text-base font-semibold">E-mail</h2>
                <a
                  href="mailto:hello@clubero.app"
                  className="mt-1 block text-sm text-muted-foreground hover:text-foreground"
                >
                  hello@clubero.app
                </a>
              </div>
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-blue-soft)] text-[color:var(--brand-blue-deep)]">
                  <MapPin className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-display text-base font-semibold">Où</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Conçu pour les clubs amateurs européens.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-3xl border border-border bg-card p-6 lg:col-span-2 lg:p-8"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Nom</Label>
                <Input
                  id="c-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Votre nom"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">E-mail</Label>
                <Input
                  id="c-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@club.fr"
                />
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="c-msg">Message</Label>
              <Textarea
                id="c-msg"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Comment pouvons-nous aider ?"
              />
            </div>
            <Button type="submit" size="lg" className="mt-6 w-full h-12">
              Envoyer le message
            </Button>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}
