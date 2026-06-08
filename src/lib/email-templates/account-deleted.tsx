import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  firstName?: string;
  hardDelete?: boolean;
  locale?: string;
}

const T = {
  fr: {
    subject: "Votre compte Clubero a été supprimé",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    bodyAnon: "Conformément à votre demande, vos données personnelles ont été anonymisées sur Clubero. Votre compte ne permet plus la connexion.",
    bodyHard: "Conformément à votre demande, votre compte et l'ensemble de vos données personnelles ont été supprimés de Clubero.",
    note: "Si vous n'êtes pas à l'origine de cette demande, contactez-nous immédiatement.",
    foot: "Merci d'avoir utilisé Clubero.",
  },
  en: {
    subject: "Your Clubero account has been deleted",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    bodyAnon: "As requested, your personal data has been anonymized on Clubero. Your account can no longer sign in.",
    bodyHard: "As requested, your account and all your personal data have been deleted from Clubero.",
    note: "If you did not request this, please contact us immediately.",
    foot: "Thanks for using Clubero.",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({ firstName, hardDelete, locale }: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={hardDelete ? t.bodyHard : t.bodyAnon} locale={l}>
      <Heading style={h1}>{t.hello(firstName)}</Heading>
      <Text style={text}>{hardDelete ? t.bodyHard : t.bodyAnon}</Text>
      <Text style={subtle}>{t.note}</Text>
      <Text style={subtle}>{t.foot}</Text>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => pick(pickLocale(d.locale)).subject,
  displayName: "Account deleted",
  previewData: { firstName: "Alex", hardDelete: false, locale: "fr" },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: 600, margin: "0 0 12px" };
const text = { fontSize: "14px", lineHeight: "22px", margin: "0 0 12px" };
const subtle = { fontSize: "12px", color: "#6b7280", margin: "8px 0 0" };
