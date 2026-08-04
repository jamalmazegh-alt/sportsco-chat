import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  email: string;
  features: string[];
  role?: string | null;
  marketing_consent?: boolean;
  source?: string;
  locale?: string;
}

const T = {
  fr: {
    preview: (email: string) => `Nouvelle inscription waitlist — ${email}`,
    title: "Nouvelle inscription liste d'attente V2",
    email: "E-mail",
    features: "Fonctionnalités",
    role: "Rôle",
    consent: "Consentement marketing",
    yes: "oui",
    no: "non",
    source: "Source",
    subject: (email: string) => `Waitlist V2 — ${email || "nouvelle inscription"}`,
  },
  en: {
    preview: (email: string) => `New waitlist signup — ${email}`,
    title: "New V2 waitlist signup",
    email: "Email",
    features: "Features",
    role: "Role",
    consent: "Marketing consent",
    yes: "yes",
    no: "no",
    source: "Source",
    subject: (email: string) => `Waitlist V2 — ${email || "new signup"}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({ email, features, role, marketing_consent, source, locale }: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.preview(email)} locale={l}>
      <Heading style={h1}>{t.title}</Heading>
      <Section style={card}>
        <Row k={t.email} v={email} />
        <Row k={t.features} v={features?.join(", ") || "—"} />
        <Row k={t.role} v={role || "—"} />
        <Row k={t.consent} v={marketing_consent ? t.yes : t.no} />
        <Row k={t.source} v={source || "landing"} />
      </Section>
    </EmailShell>
  );
};

const Row = ({ k, v }: { k: string; v: string }) => (
  <Text style={row}>
    <strong style={key}>{k} : </strong>
    {v}
  </Text>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => pick(pickLocale(data.locale)).subject(data.email ?? ""),
  displayName: "Notification interne waitlist V2",
  to: "hello@clubero.app",
  previewData: {
    email: "demo@example.com",
    features: ["player_network", "payments"],
    role: "coach",
    marketing_consent: true,
    source: "landing",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const card = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "12px 0",
};
const row = { fontSize: "14px", color: "#334155", lineHeight: "1.55", margin: "0 0 6px" };
const key = { color: "#0f172a" };
