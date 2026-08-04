import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  campTitle: string;
  clubName?: string;
  participantName: string;
  documentTitle: string;
  wasRejected?: boolean;
  manageUrl: string;
  locale?: string;
}

const T = {
  fr: {
    preview: (doc: string, participant: string) => `Document renvoyé : ${doc} — ${participant}`,
    brand: "Clubero · Stages",
    title: "Document renvoyé",
    body: (camp: string, clubSuffix: string, wasRejected?: boolean) => (
      <>
        Un document {wasRejected ? "précédemment refusé " : ""}vient d'être renvoyé pour le stage{" "}
        <strong>{camp}</strong>
        {clubSuffix}.
      </>
    ),
    labelDoc: "Document",
    labelStatus: "Statut : en attente de validation",
    cta: "Vérifier le document",
    orLink: "Ou ouvrez ce lien :",
    subject: (participant: string, doc: string) => `Document renvoyé — ${participant} (${doc})`,
  },
  en: {
    preview: (doc: string, participant: string) => `Document resubmitted: ${doc} — ${participant}`,
    brand: "Clubero · Camps",
    title: "Document resubmitted",
    body: (camp: string, clubSuffix: string, wasRejected?: boolean) => (
      <>
        A document{wasRejected ? " previously rejected" : ""} has just been resubmitted for the camp{" "}
        <strong>{camp}</strong>
        {clubSuffix}.
      </>
    ),
    labelDoc: "Document",
    labelStatus: "Status: pending review",
    cta: "Review document",
    orLink: "Or open this link:",
    subject: (participant: string, doc: string) => `Document resubmitted — ${participant} (${doc})`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const CampDocumentResubmitted = ({
  campTitle,
  clubName,
  participantName,
  documentTitle,
  wasRejected,
  manageUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const clubSuffix = clubName ? ` (${clubName})` : "";

  return (
    <EmailShell preview={t.preview(documentTitle, participantName)} locale={l}>
      <Section style={header}>
        <Img
          src="https://www.clubero.app/clubero-logo.png"
          alt="Clubero"
          width="56"
          height="56"
          style={logo}
        />
        <Text style={brand}>{t.brand}</Text>
      </Section>
      <Heading style={h1}>{t.title}</Heading>
      <Text style={text}>{t.body(campTitle, clubSuffix, wasRejected)}</Text>
      <Section style={card}>
        <Text style={cardTitle}>{participantName}</Text>
        <Text style={cardLine}>
          {t.labelDoc} : {documentTitle}
        </Text>
        <Text style={cardLine}>{t.labelStatus}</Text>
      </Section>
      <Button style={button} href={manageUrl}>
        {t.cta}
      </Button>
      <Text style={small}>
        {t.orLink}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{manageUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: CampDocumentResubmitted,
  subject: (data) => {
    const t = pick(pickLocale((data as { locale?: string }).locale));
    return t.subject(
      (data.participantName as string | undefined) ?? "",
      (data.documentTitle as string | undefined) ?? "",
    );
  },
  displayName: "Camp document resubmitted",
  previewData: {
    campTitle: "Stage de printemps U11",
    clubName: "FC Villeneuve",
    participantName: "Léo Dupont",
    documentTitle: "Certificat médical",
    wasRejected: true,
    manageUrl: "https://clubero.app/admin/stages/sample",
    locale: "fr",
  },
} satisfies TemplateEntry;

const header = { textAlign: "center" as const, margin: "0 0 20px" };
const logo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const brand = {
  fontSize: "13px",
  fontWeight: "bold" as const,
  color: "#0f172a",
  margin: "8px 0 0",
  textAlign: "center" as const,
};
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 16px" };
const card = {
  backgroundColor: "#f1f5f9",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "0 0 20px",
};
const cardTitle = {
  fontSize: "16px",
  fontWeight: "bold" as const,
  color: "#0f172a",
  margin: "0 0 6px",
};
const cardLine = { fontSize: "13px", color: "#475569", margin: "2px 0" };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "10px",
  padding: "12px 20px",
  textDecoration: "none",
  display: "inline-block",
};
const small = { fontSize: "12px", color: "#64748b", margin: "20px 0 0", lineHeight: "1.5" };
