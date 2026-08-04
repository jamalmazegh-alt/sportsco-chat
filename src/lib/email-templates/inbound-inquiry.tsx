import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

type InquiryKind = "contact" | "demo";

interface Props {
  kind: InquiryKind;
  firstName?: string;
  lastName?: string;
  name?: string;
  email: string;
  phone?: string;
  club?: string;
  role?: string;
  teams?: string;
  message?: string;
  notes?: string;
  locale?: string;
}

const T = {
  fr: {
    labels: {
      contact: "Nouveau message de contact",
      demo: "Nouvelle demande de démo",
    } as Record<InquiryKind, string>,
    fallbackLabel: "Nouveau message",
    firstName: "Prénom",
    lastName: "Nom",
    email: "E-mail",
    phone: "Téléphone",
    role: "Rôle",
    club: "Club",
    teams: "Équipes",
    notes: "Notes",
    message: "Message",
    subject: (label: string, who: string) => `[Clubero] ${label} — ${who}`,
  },
  en: {
    labels: {
      contact: "New contact message",
      demo: "New demo request",
    } as Record<InquiryKind, string>,
    fallbackLabel: "New message",
    firstName: "First name",
    lastName: "Name",
    email: "Email",
    phone: "Phone",
    role: "Role",
    club: "Club",
    teams: "Teams",
    notes: "Notes",
    message: "Message",
    subject: (label: string, who: string) => `[Clubero] ${label} — ${who}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const InboundInquiryEmail = (props: Props) => {
  const l = pickLocale(props.locale);
  const t = pick(l);
  const kind: InquiryKind = (props.kind as InquiryKind) ?? "contact";
  const label = t.labels[kind] ?? t.fallbackLabel;
  const isDemo = kind === "demo";
  return (
    <EmailShell preview={`${label} — ${props.firstName || props.name || props.email}`} locale={l}>
      <Heading style={h1}>{label}</Heading>
      <Section style={card}>
        {props.firstName && <Row k={t.firstName} v={props.firstName} />}
        {(props.lastName || props.name) && (
          <Row k={t.lastName} v={props.lastName || props.name || "—"} />
        )}
        <Row k={t.email} v={props.email || "—"} />
        {props.phone && <Row k={t.phone} v={props.phone} />}
        {props.role && <Row k={t.role} v={props.role} />}
        {isDemo && <Row k={t.club} v={props.club || "—"} />}
        {isDemo && <Row k={t.teams} v={props.teams || "—"} />}
      </Section>
      {(props.message || props.notes) && (
        <>
          <Heading as="h2" style={h2}>
            {isDemo ? t.notes : t.message}
          </Heading>
          <Text style={msg}>{props.message || props.notes}</Text>
        </>
      )}
    </EmailShell>
  );
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Text style={row}>
      <span style={key}>{k} :</span> <span style={val}>{v}</span>
    </Text>
  );
}

export const template = {
  component: InboundInquiryEmail,
  to: "hello@clubero.app",
  subject: (data: Record<string, any>) => {
    const t = pick(pickLocale(data.locale));
    const kind: InquiryKind = (data.kind as InquiryKind) ?? "contact";
    const label = t.labels[kind] ?? t.fallbackLabel;
    const who = data.club || data.name || data.email || "site";
    return t.subject(label, who);
  },
  displayName: "Demande entrante (contact / démo)",
  previewData: {
    kind: "demo",
    name: "Jane Coach",
    email: "jane@asriverside.fr",
    club: "AS Riverside",
    role: "Coach U15",
    teams: "6",
    notes: "On utilise WhatsApp + Excel, on cherche mieux.",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const h2 = {
  fontSize: "14px",
  fontWeight: "bold" as const,
  color: "#0f172a",
  margin: "20px 0 8px",
};
const card = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "12px 16px",
};
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.5" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
const msg = {
  fontSize: "14px",
  color: "#334155",
  lineHeight: "1.55",
  whiteSpace: "pre-wrap" as const,
  margin: "0",
};
