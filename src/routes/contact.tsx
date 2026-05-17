import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { toast } from "sonner";

const ROLES = [
  "Président·e",
  "Dirigeant·e",
  "Coach",
  "Responsable technique",
  "Parent",
  "Joueur·euse",
  "Autre",
];

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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [club, setClub] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "contact", firstName, lastName, email, phone, role, club, message }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSent(true);
      setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setRole(""); setClub(""); setMessage("");
      toast.success("Message envoyé. Nous revenons vers vous sous 48h ouvrées.");
    } catch (err) {
      console.error(err);
      toast.error("Envoi impossible. Réessayez ou écrivez à hello@clubero.app.");
    } finally {
      setSubmitting(false);
    }
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
            Question, partenariat ou simple curiosité ? Écrivez-nous — nous
            reviendrons vers vous sous <strong>48h ouvrées</strong>.
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
                <Label htmlFor="c-firstName">Prénom</Label>
                <Input
                  id="c-firstName"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Votre prénom"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-lastName">Nom</Label>
                <Input
                  id="c-lastName"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Votre nom"
                />
              </div>
            </div>
            <div className="mt-4">
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Téléphone</Label>
                <Input
                  id="c-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-role">Votre rôle</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="c-role">
                    <SelectValue placeholder="Sélectionnez un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <Button type="submit" size="lg" disabled={submitting} className="mt-6 w-full h-12">
              {submitting ? "Envoi…" : sent ? "Message envoyé ✓" : "Envoyer le message"}
            </Button>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}
