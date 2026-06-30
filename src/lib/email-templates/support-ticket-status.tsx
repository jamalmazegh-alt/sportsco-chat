import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  subject?: string;
  ticketShortId?: string;
  newStatus?: string;
  ticketUrl?: string;
  locale?: "fr" | "en" | string;
}

const STATUS_LABELS_FR: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  waiting_user: "En attente de votre réponse",
  resolved: "Résolu",
  closed: "Fermé",
};
const STATUS_LABELS_EN: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_user: "Waiting for your reply",
  resolved: "Resolved",
  closed: "Closed",
};

const COPY = {
  fr: {
    preview: "Mise à jour de votre demande de support — Clubero",
    greet: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    intro: (subject?: string, id?: string, status?: string) =>
      `Le statut de votre demande${subject ? ` "${subject}"` : ""}${id ? ` (#${id})` : ""} a été mis à jour : ${status ?? "—"}.`,
    follow: "Consulter le ticket :",
    subject_line: (id?: string, subject?: string) => {
      const s = subject ? truncateSubject(subject) : "";
      if (id && s) return `Mise à jour de votre demande #${id} : ${s} — Clubero`;
      if (id) return `Mise à jour de votre demande #${id} — Clubero`;
      if (s) return `Mise à jour de votre demande : ${s} — Clubero`;
      return "Mise à jour de votre demande — Clubero";
    },
    label: (s?: string) => (s ? (STATUS_LABELS_FR[s] ?? s) : "—"),
  },
  en: {
    preview: "Your support request was updated — Clubero",
    greet: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    intro: (subject?: string, id?: string, status?: string) =>
      `The status of your request${subject ? ` "${subject}"` : ""}${id ? ` (#${id})` : ""} was updated to: ${status ?? "—"}.`,
    follow: "View the ticket:",
    subject_line: (id?: string, subject?: string) => {
      const s = subject ? truncateSubject(subject) : "";
      if (id && s) return `Update on your request #${id}: ${s} — Clubero`;
      if (id) return `Update on your request #${id} — Clubero`;
      if (s) return `Update on your request: ${s} — Clubero`;
      return "Update on your support request — Clubero";
    },
    label: (s?: string) => (s ? (STATUS_LABELS_EN[s] ?? s) : "—"),
  },
} as const;

const MAX_SUBJECT_IN_EMAIL_LINE = 60;
function truncateSubject(s: string) {
  if (s.length <= MAX_SUBJECT_IN_EMAIL_LINE) return s;
  return s.slice(0, MAX_SUBJECT_IN_EMAIL_LINE - 1).trimEnd() + "…";
}

const pick = (locale?: string) => (locale === "en" ? COPY.en : COPY.fr);

const SupportTicketStatusEmail = ({
  name,
  subject,
  ticketShortId,
  newStatus,
  ticketUrl,
  locale,
}: Props) => {
  const c = pick(locale);
  return (
    <EmailShell preview={c.preview} locale="fr">
      <Heading style={h1}>{c.greet(name)}</Heading>
      <Text style={text}>{c.intro(subject, ticketShortId, c.label(newStatus))}</Text>
      {ticketUrl && (
        <Text style={text}>
          {c.follow}{" "}
          <a href={ticketUrl} style={link}>
            {ticketUrl}
          </a>
        </Text>
      )}
    </EmailShell>
  );
};

export const template = {
  component: SupportTicketStatusEmail,
  subject: (data: Record<string, any>) => pick(data.locale).subject_line(data.ticketShortId, data.subject),
  displayName: "Support — Changement de statut",
  previewData: {
    name: "Jane",
    subject: "Problème de connexion",
    ticketShortId: "A1B2C3",
    newStatus: "in_progress",
    ticketUrl: "https://www.clubero.app/support",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 14px" };
const link = { color: "#2563eb", textDecoration: "none" };
