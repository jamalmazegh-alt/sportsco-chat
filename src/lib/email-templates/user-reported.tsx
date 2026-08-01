import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  moderatorFirstName?: string;
  reporterName: string;
  reportedName: string;
  reasonLabel: string;
  details?: string | null;
  moderationUrl: string;
  locale?: string;
}

const T = {
  fr: {
    subject: "Membre signalé dans votre club",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (r: string, m: string) => `${r} a signalé ${m}, membre de votre club.`,
    reason: "Motif",
    details: "Précisions",
    cta: "Examiner le signalement",
    foot: "Vous recevez cet e-mail en tant que responsable du club sur Clubero.",
  },
  en: {
    subject: "Member reported in your club",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (r: string, m: string) => `${r} reported ${m}, a member of your club.`,
    reason: "Reason",
    details: "Details",
    cta: "Review the report",
    foot: "You receive this email as a club manager on Clubero.",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({
  moderatorFirstName,
  reporterName,
  reportedName,
  reasonLabel,
  details,
  moderationUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.body(reporterName, reportedName)} locale={l}>
      <Heading style={h1}>{t.hello(moderatorFirstName)}</Heading>
      <Text style={text}>
        <strong>{t.body(reporterName, reportedName)}</strong>
      </Text>
      <Text style={text}>
        <strong>{t.reason} :</strong> {reasonLabel}
      </Text>
      {details && (
        <Text style={text}>
          <strong>{t.details} :</strong> {details}
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
  displayName: "User reported",
  previewData: {
    moderatorFirstName: "Marc",
    reporterName: "Sophie Dupont",
    reportedName: "Jean Martin",
    reasonLabel: "Harcèlement",
    details: "Messages insistants après les entraînements.",
    moderationUrl: "https://www.clubero.app/admin/moderation",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const subtle = { fontSize: "13px", color: "#64748b", margin: "16px 0 0" };
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
