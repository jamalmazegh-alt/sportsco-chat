import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  email: string;
  features: string[];
  role?: string | null;
  marketing_consent?: boolean;
  source?: string;
}

const Email = ({ email, features, role, marketing_consent, source }: Props) => (
  <EmailShell preview={`Nouvelle inscription waitlist — ${email}`} locale={"fr"}>
    <Heading style={h1}>Nouvelle inscription liste d'attente V2</Heading>
    <Section style={card}>
      <Row k="E-mail" v={email} />
      <Row k="Fonctionnalités" v={features?.join(", ") || "—"} />
      <Row k="Rôle" v={role || "—"} />
      <Row k="Consentement marketing" v={marketing_consent ? "oui" : "non"} />
      <Row k="Source" v={source || "landing"} />
    </Section>
  </EmailShell>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <Text style={row}>
    <strong style={key}>{k} : </strong>
    {v}
  </Text>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `Waitlist V2 — ${data.email ?? "nouvelle inscription"}`,
  displayName: "Notification interne waitlist V2",
  to: "hello@clubero.app",
  previewData: {
    email: "demo@example.com",
    features: ["player_network", "payments"],
    role: "coach",
    marketing_consent: true,
    source: "landing",
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
