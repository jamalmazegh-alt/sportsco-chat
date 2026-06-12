import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
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

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: i18n.t("meta.contact.title") },
      { name: "description", content: i18n.t("meta.contact.description") },
      { property: "og:title", content: i18n.t("meta.contact.title") },
      { property: "og:description", content: i18n.t("meta.contact.ogDescription") },
      { property: "og:url", content: "https://clubero.app/contact" },
    ],
    links: [{ rel: "canonical", href: "https://clubero.app/contact" }],
  }),
});

function ContactPage() {
  const { t } = useTranslation("marketing");
  const roles = t("contact.roles", { returnObjects: true }) as string[];

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
        body: JSON.stringify({ kind: "contact", firstName, lastName, email, phone, role, club, message, locale: i18n.language?.slice(0, 2) || "fr" }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSent(true);
      setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setRole(""); setClub(""); setMessage("");
      toast.success(t("contact.successToast"));
    } catch (err) {
      console.error(err);
      toast.error(t("contact.errorToast"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingLayout>
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center lg:px-8 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-blue-deep)]">
            {t("contact.kicker")}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t("contact.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            {t("contact.subtitlePre")}
            <strong>{t("contact.subtitleStrong")}</strong>
            {t("contact.subtitlePost")}
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
                <h2 className="mt-4 font-display text-base font-semibold">{t("contact.emailLabel")}</h2>
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
                <h2 className="mt-4 font-display text-base font-semibold">{t("contact.whereLabel")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("contact.whereBody")}
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
                <Label htmlFor="c-firstName">{t("contact.firstName")}</Label>
                <Input
                  id="c-firstName"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder={t("contact.firstNamePh")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-lastName">{t("contact.lastName")}</Label>
                <Input
                  id="c-lastName"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder={t("contact.lastNamePh")}
                />
              </div>
            </div>
            <div className="mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="c-email">{t("contact.email")}</Label>
                <Input
                  id="c-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("contact.emailPh")}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">{t("contact.phone")}</Label>
                <Input
                  id="c-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("contact.phonePh")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-role">{t("contact.role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="c-role">
                    <SelectValue placeholder={t("contact.rolePh")} />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="c-club">{t("contact.club")}</Label>
              <Input
                id="c-club"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                placeholder={t("contact.clubPh")}
              />
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="c-msg">{t("contact.message")}</Label>
              <Textarea
                id="c-msg"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("contact.messagePh")}
              />
            </div>
            <Button type="submit" size="lg" disabled={submitting} className="mt-6 w-full h-12">
              {submitting ? t("contact.submitting") : sent ? t("contact.submitted") : t("contact.submit")}
            </Button>
          </form>
        </div>
      </section>
    </MarketingLayout>
  );
}
