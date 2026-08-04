import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  guardianFirstName?: string;
  participantName: string;
  campTitle: string;
  clubName: string;
  documentLabel: string;
  rejectionReason: string;
  trackingUrl?: string;
  locale?: string;
}

const T = {
  fr: {
    preview: (camp: string) => `Document à renvoyer — ${camp}`,
    brand: "Clubero · Stages",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (participant: string, camp: string, club: string) => (
      <>
        Un document du dossier de <strong>{participant}</strong> pour le stage
        <strong> {camp}</strong> ({club}) a été <strong>refusé</strong> par le club.
      </>
    ),
    docLabel: "Document concerné",
    reasonLabel: "Motif du refus",
    resubmit: "Merci de renvoyer une nouvelle version depuis votre espace de suivi personnel :",
    cta: "Renvoyer le document",
    orLink: "Ou ouvrez ce lien :",
    personalLink: "Ce lien est personnel — ne le partagez pas.",
    help: "Une question sur ce refus ? Répondez directement au club organisateur.",
    subject: (camp: string) => `Document à renvoyer — ${camp}`,
    fallbackCamp: "stage",
  },
  en: {
    preview: (camp: string) => `Document to resubmit — ${camp}`,
    brand: "Clubero · Camps",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (participant: string, camp: string, club: string) => (
      <>
        A document in <strong>{participant}</strong>'s file for the camp
        <strong> {camp}</strong> ({club}) was <strong>rejected</strong> by the club.
      </>
    ),
    docLabel: "Document concerned",
    reasonLabel: "Reason for rejection",
    resubmit: "Please send a new version from your personal tracking page:",
    cta: "Resubmit document",
    orLink: "Or open this link:",
    personalLink: "This link is personal — do not share it.",
    help: "Questions about this rejection? Reply directly to the organizing club.",
    subject: (camp: string) => `Document to resubmit — ${camp}`,
    fallbackCamp: "camp",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const CampDocumentRejected = ({
  guardianFirstName,
  participantName,
  campTitle,
  clubName,
  documentLabel,
  rejectionReason,
  trackingUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);

  return (
    <EmailShell preview={t.preview(campTitle)} locale={l}>
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
      <Heading style={h1}>{t.hello(guardianFirstName)}</Heading>
      <Text style={text}>{t.body(participantName, campTitle, clubName)}</Text>
      <Section style={card}>
        <Text style={cardLabel}>{t.docLabel}</Text>
        <Text style={cardValue}>{documentLabel}</Text>
        <Text style={cardLabel}>{t.reasonLabel}</Text>
        <Text style={cardValue}>{rejectionReason}</Text>
      </Section>
      <Text style={text}>{t.resubmit}</Text>
      {trackingUrl && (
        <>
          <Button style={button} href={trackingUrl}>
            {t.cta}
          </Button>
          <Text style={small}>
            {t.orLink}
            <br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{trackingUrl}</span>
            <br />
            <em>{t.personalLink}</em>
          </Text>
        </>
      )}
      <Text style={small}>{t.help}</Text>
    </EmailShell>
  );
};

export const template = {
  component: CampDocumentRejected,
  subject: (data) => {
    const t = pick(pickLocale((data as { locale?: string }).locale));
    return t.subject((data.campTitle as string | undefined) ?? t.fallbackCamp);
  },
  displayName: "Camp document rejected",
  previewData: {
    guardianFirstName: "Marie",
    participantName: "Léo Dupont",
    campTitle: "Stage de printemps U11",
    clubName: "FC Villeneuve",
    documentLabel: "Certificat médical",
    rejectionReason: "Le document est illisible, merci d'envoyer un scan de meilleure qualité.",
    trackingUrl: "https://clubero.app/stages/fc-villeneuve/stage-printemps/suivi/token",
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
  backgroundColor: "#fef2f2",
  borderLeft: "3px solid #ef4444",
  borderRadius: "10px",
  padding: "14px 18px",
  margin: "0 0 20px",
};
const cardLabel = {
  fontSize: "11px",
  fontWeight: "bold" as const,
  color: "#991b1b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "6px 0 2px",
};
const cardValue = { fontSize: "14px", color: "#0f172a", margin: "0 0 6px", lineHeight: "1.5" };
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
