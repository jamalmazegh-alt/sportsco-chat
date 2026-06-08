import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  firstName?: string;
  downloadUrl: string;
  expiresInDays: number;
  locale?: string;
}

const T = {
  fr: {
    subject: "Votre export de données est prêt",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: "Votre archive RGPD est prête à télécharger.",
    cta: "Télécharger l'archive",
    expires: (d: number) => `Ce lien expire dans ${d} jours.`,
    foot: "Vous recevez cet e-mail car vous avez demandé un export de vos données personnelles sur Clubero.",
  },
  en: {
    subject: "Your data export is ready",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: "Your GDPR archive is ready to download.",
    cta: "Download archive",
    expires: (d: number) => `This link expires in ${d} days.`,
    foot: "You received this email because you requested an export of your personal data on Clubero.",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const Email = ({ firstName, downloadUrl, expiresInDays, locale }: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.body} locale={l}>
      <Heading style={h1}>{t.hello(firstName)}</Heading>
      <Text style={text}>{t.body}</Text>
      <Button href={downloadUrl} style={btn}>{t.cta}</Button>
      <Text style={subtle}>{t.expires(expiresInDays)}</Text>
      <Text style={subtle}>{t.foot}</Text>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => pick(pickLocale(d.locale)).subject,
  displayName: "Data export ready",
  previewData: { firstName: "Alex", downloadUrl: "https://example.com/x.zip", expiresInDays: 7, locale: "fr" },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: 600, margin: "0 0 12px" };
const text = { fontSize: "14px", lineHeight: "22px", margin: "0 0 12px" };
const subtle = { fontSize: "12px", color: "#6b7280", margin: "8px 0 0" };
const btn = { background: "#111827", color: "#fff", padding: "12px 18px", borderRadius: "8px", textDecoration: "none", fontSize: "14px", display: "inline-block", margin: "12px 0" };
