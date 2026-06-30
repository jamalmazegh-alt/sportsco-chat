import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

type Kind = "new_ticket" | "user_reply";

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
}

const LABELS: Record<Kind, string> = {
  new_ticket: "Nouveau ticket support",
  user_reply: "Nouvelle réponse utilisateur",
};

const SupportTicketInternalEmail = (props: Props) => {
  const kind: Kind = (props.kind as Kind) ?? "new_ticket";
  const label = LABELS[kind];
  return (
    <EmailShell
      preview={`${label}${props.ticketShortId ? ` #${props.ticketShortId}` : ""}`}
      locale="fr"
    >
      <Heading style={h1}>
        {label}
        {props.ticketShortId ? ` #${props.ticketShortId}` : ""}
      </Heading>
      <Section style={card}>
        {props.subject && <Row k="Sujet" v={props.subject} />}
        {props.category && <Row k="Catégorie" v={props.category} />}
        {props.priority && <Row k="Priorité" v={props.priority} />}
        {props.authorName && <Row k="Auteur" v={props.authorName} />}
        {props.authorEmail && <Row k="E-mail" v={props.authorEmail} />}
      </Section>
      {props.bodyPreview && (
        <>
          <Heading as="h2" style={h2}>
            Message
          </Heading>
          <Text style={msg}>{props.bodyPreview}</Text>
        </>
      )}
      {props.ticketUrl && (
        <Text style={text}>
          Ouvrir le ticket :{" "}
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
    const kind: Kind = (data.kind as Kind) ?? "new_ticket";
    const label = LABELS[kind] ?? "Support";
    const id = data.ticketShortId ? ` #${data.ticketShortId}` : "";
    const subj = data.subject ? ` — ${data.subject}` : "";
    return `[Clubero] ${label}${id}${subj}`;
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
