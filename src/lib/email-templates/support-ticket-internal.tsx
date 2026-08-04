import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

type Kind = "new_ticket" | "user_reply" | "user_reopened" | "user_resolved";

interface Props {
  kind: Kind;
  ticketShortId?: string;
  subject?: string;
  category?: string;
  priority?: string;
  authorName?: string | null;
  authorEmail?: string | null;
  bodyPreview?: string;
  ticketUrl?: string;
  locale?: string;
}

const T = {
  fr: {
    labels: {
      new_ticket: "Nouveau ticket support",
      user_reply: "Nouvelle réponse utilisateur",
      user_reopened: "Ticket rouvert par l'utilisateur",
      user_resolved: "Ticket résolu par l'utilisateur",
    } as Record<Kind, string>,
    fallback: "Support",
    subjectLabel: "Sujet",
    category: "Catégorie",
    priority: "Priorité",
    author: "Auteur",
    email: "E-mail",
    message: "Message",
    open: "Ouvrir le ticket :",
    subject: (label: string, id: string, subj: string) => `[Clubero] ${label}${id}${subj}`,
  },
  en: {
    labels: {
      new_ticket: "New support ticket",
      user_reply: "New user reply",
      user_reopened: "Ticket reopened by user",
      user_resolved: "Ticket resolved by user",
    } as Record<Kind, string>,
    fallback: "Support",
    subjectLabel: "Subject",
    category: "Category",
    priority: "Priority",
    author: "Author",
    email: "Email",
    message: "Message",
    open: "Open ticket:",
    subject: (label: string, id: string, subj: string) => `[Clubero] ${label}${id}${subj}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const SupportTicketInternalEmail = (props: Props) => {
  const l = pickLocale(props.locale);
  const t = pick(l);
  const kind: Kind = (props.kind as Kind) ?? "new_ticket";
  const label = t.labels[kind] ?? t.fallback;
  return (
    <EmailShell
      preview={`${label}${props.ticketShortId ? ` #${props.ticketShortId}` : ""}`}
      locale={l}
    >
      <Heading style={h1}>
        {label}
        {props.ticketShortId ? ` #${props.ticketShortId}` : ""}
      </Heading>
      <Section style={card}>
        {props.subject && <Row k={t.subjectLabel} v={props.subject} />}
        {props.category && <Row k={t.category} v={props.category} />}
        {props.priority && <Row k={t.priority} v={props.priority} />}
        {props.authorName && <Row k={t.author} v={props.authorName} />}
        {props.authorEmail && <Row k={t.email} v={props.authorEmail} />}
      </Section>
      {props.bodyPreview && (
        <>
          <Heading as="h2" style={h2}>
            {t.message}
          </Heading>
          <Text style={msg}>{props.bodyPreview}</Text>
        </>
      )}
      {props.ticketUrl && (
        <Text style={text}>
          {t.open}{" "}
          <a href={props.ticketUrl} style={link}>
            {props.ticketUrl}
          </a>
        </Text>
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
  component: SupportTicketInternalEmail,
  to: "hello@clubero.app",
  subject: (data: Record<string, any>) => {
    const t = pick(pickLocale(data.locale));
    const kind: Kind = (data.kind as Kind) ?? "new_ticket";
    const label = t.labels[kind] ?? t.fallback;
    const id = data.ticketShortId ? ` #${data.ticketShortId}` : "";
    const subj = data.subject ? ` — ${data.subject}` : "";
    return t.subject(label, id, subj);
  },
  displayName: "Support — Notification interne (hello@)",
  previewData: {
    kind: "new_ticket",
    ticketShortId: "A1B2C3",
    subject: "Problème de connexion",
    category: "bug",
    priority: "normal",
    authorName: "Jane Coach",
    authorEmail: "jane@example.com",
    bodyPreview: "Je n'arrive plus à me connecter depuis ce matin…",
    ticketUrl: "https://www.clubero.app/superadmin/support-tickets/abc",
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
  margin: "0 0 14px",
};
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "12px 0" };
const link = { color: "#2563eb", textDecoration: "none" };
