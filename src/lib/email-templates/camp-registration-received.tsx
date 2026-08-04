import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  guardianFirstName?: string;
  participantName: string;
  campTitle: string;
  clubName: string;
  campStartDate?: string;
  campEndDate?: string;
  referenceId?: string;
  trackingUrl?: string;
  isFull?: boolean;
  locale?: string;
}

const T = {
  fr: {
    preview: (camp: string) => `Inscription bien reçue — ${camp}`,
    brand: "Clubero · Stages",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    body: (participant: string, camp: string, club: string) => (
      <>
        Nous avons bien reçu l'inscription de <strong>{participant}</strong> au stage
        <strong> {camp}</strong> organisé par <strong>{club}</strong>.
      </>
    ),
    labelCamp: "Stage",
    labelChild: "Enfant",
    labelDates: "Dates",
    labelRef: "Référence",
    waitlist: (
      <>
        ⚠️ Le stage est actuellement <strong>complet</strong>. Votre demande est enregistrée en
        liste d'attente : le club vous recontactera dès qu'une place se libère ou pour confirmer
        votre placement.
      </>
    ),
    pending:
      "Votre dossier est en attente de validation par le club. Vous recevrez un email dès qu'il aura été traité.",
    trackingIntro:
      "Vous pouvez suivre l'avancement de votre dossier, télécharger vos pièces et remplacer une pièce refusée depuis votre lien personnel :",
    cta: "Suivre mon inscription",
    orLink: "Ou ouvrez ce lien :",
    personalLink: "Ce lien est personnel — ne le partagez pas.",
    ignore: "Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet email.",
    subject: (camp: string) => `Inscription bien reçue — ${camp}`,
    fallbackCamp: "stage",
  },
  en: {
    preview: (camp: string) => `Registration received — ${camp}`,
    brand: "Clubero · Camps",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    body: (participant: string, camp: string, club: string) => (
      <>
        We have received the registration of <strong>{participant}</strong> for the camp
        <strong> {camp}</strong> organized by <strong>{club}</strong>.
      </>
    ),
    labelCamp: "Camp",
    labelChild: "Child",
    labelDates: "Dates",
    labelRef: "Reference",
    waitlist: (
      <>
        ⚠️ The camp is currently <strong>full</strong>. Your request has been added to the waitlist:
        the club will contact you when a spot opens or to confirm your place.
      </>
    ),
    pending:
      "Your registration is pending club review. You will receive an email once it has been processed.",
    trackingIntro:
      "You can track your registration, upload documents, and replace a rejected document from your personal link:",
    cta: "Track my registration",
    orLink: "Or open this link:",
    personalLink: "This link is personal — do not share it.",
    ignore: "If you did not submit this registration, you can ignore this email.",
    subject: (camp: string) => `Registration received — ${camp}`,
    fallbackCamp: "camp",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const formatCampDates = (start: string, end: string, l: Locale) => {
  const bcp = l === "en" ? "en-GB" : "fr-FR";
  return `${new Date(start).toLocaleDateString(bcp)} → ${new Date(end).toLocaleDateString(bcp)}`;
};

const CampRegistrationReceived = ({
  guardianFirstName,
  participantName,
  campTitle,
  clubName,
  campStartDate,
  campEndDate,
  referenceId,
  trackingUrl,
  isFull,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const dates =
    campStartDate && campEndDate ? formatCampDates(campStartDate, campEndDate, l) : null;

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
        <Text style={cardLine}>
          {t.labelCamp} : {campTitle}
        </Text>
        <Text style={cardLine}>
          {t.labelChild} : {participantName}
        </Text>
        {dates && (
          <Text style={cardLine}>
            {t.labelDates} : {dates}
          </Text>
        )}
        {referenceId && (
          <Text style={cardLine}>
            {t.labelRef} : {referenceId}
          </Text>
        )}
      </Section>
      {isFull ? (
        <Section style={warn}>
          <Text style={warnText}>{t.waitlist}</Text>
        </Section>
      ) : (
        <Text style={text}>{t.pending}</Text>
      )}
      {trackingUrl && (
        <>
          <Text style={text}>{t.trackingIntro}</Text>
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
      <Text style={small}>{t.ignore}</Text>
    </EmailShell>
  );
};

export const template = {
  component: CampRegistrationReceived,
  subject: (data) => {
    const t = pick(pickLocale((data as { locale?: string }).locale));
    return t.subject((data.campTitle as string | undefined) ?? t.fallbackCamp);
  },
  displayName: "Camp registration received",
  previewData: {
    guardianFirstName: "Marie",
    participantName: "Léo Dupont",
    campTitle: "Stage de printemps U11",
    clubName: "FC Villeneuve",
    campStartDate: new Date().toISOString(),
    campEndDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    referenceId: "AB12CD34",
    trackingUrl: "https://clubero.app/stages/fc-villeneuve/stage-printemps/suivi/token",
    isFull: false,
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
const cardLine = { fontSize: "13px", color: "#475569", margin: "2px 0" };
const warn = {
  backgroundColor: "#fef3c7",
  borderRadius: "12px",
  padding: "14px 16px",
  margin: "0 0 20px",
};
const warnText = { fontSize: "14px", color: "#92400e", margin: 0, lineHeight: "1.5" };
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
