import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  moderatorFirstName?: string;
  reporterName: string;
  contentKind: "post" | "comment";
  reasonLabel: string;
  details?: string | null;
  excerpt?: string | null;
  moderationUrl: string;
  locale?: string;
}

const T = {
  fr: {
    subject: "Contenu signalé sur le mur",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (r: string, k: "post" | "comment") =>
      `${r} a signalé ${k === "post" ? "une publication" : "un commentaire"} du mur de votre club.`,
    reason: "Motif",
    details: "Précisions",
    excerpt: "Extrait du contenu",
    cta: "Examiner le signalement",
    foot: "Vous recevez cet e-mail en tant que responsable du club sur Clubero.",
  },
  en: {
    subject: "Reported content on the wall",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (r: string, k: "post" | "comment") =>
      `${r} reported ${k === "post" ? "a post" : "a comment"} on your club wall.`,
    reason: "Reason",
    details: "Details",
    excerpt: "Content excerpt",
    cta: "Review the report",
    foot: "You receive this email as a club manager on Clubero.",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({
  moderatorFirstName,
  reporterName,
  contentKind,
  reasonLabel,
  details,
  excerpt,
  moderationUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.body(reporterName, contentKind)} locale={l}>
      <Heading style={h1}>{t.hello(moderatorFirstName)}</Heading>
      <Text style={text}>
        <strong>{t.body(reporterName, contentKind)}</strong>
      </Text>
      <Text style={text}>
        <strong>{t.reason} :</strong> {reasonLabel}
      </Text>
      {details && (
        <Text style={text}>
          <strong>{t.details} :</strong> {details}
        </Text>
      )}
      {excerpt && (
        <Text style={quote}>
          <strong>{t.excerpt} :</strong> {excerpt}
        </Text>
      )}
      <Button style={button} href={moderationUrl}>
        {t.cta}
      </Button>
      <Text style={subtle}>{t.foot}</Text>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (d) => pick(pickLocale((d as { locale?: string }).locale)).subject,
  displayName: "Wall content reported",
  previewData: {
    moderatorFirstName: "Marc",
    reporterName: "Sophie Dupont",
    contentKind: "post",
    reasonLabel: "Contenu inapproprié",
    details: "Le message contient des propos déplacés.",
    excerpt: "Lorem ipsum dolor sit amet…",
    moderationUrl: "https://www.clubero.app/admin/moderation",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const subtle = { fontSize: "13px", color: "#64748b", margin: "16px 0 0" };
const quote = {
  fontSize: "14px",
  color: "#475569",
  lineHeight: "1.55",
  margin: "0 0 16px",
  padding: "10px 14px",
  borderLeft: "3px solid #cbd5e1",
  backgroundColor: "#f8fafc",
};
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
  marginTop: "8px",
};
