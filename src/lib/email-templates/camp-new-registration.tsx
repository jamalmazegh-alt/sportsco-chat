import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  campTitle: string;
  clubName?: string;
  participantName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone?: string;
  manageUrl: string;
  locale?: string;
}

const T = {
  fr: {
    preview: (participant: string, camp: string) =>
      `Nouvelle inscription : ${participant} — ${camp}`,
    brand: "Clubero · Stages",
    title: "Nouvelle inscription",
    body: (camp: string, club?: string) => (
      <>
        Une nouvelle inscription vient d'arriver pour le stage <strong>{camp}</strong>
        {club ? ` (${club})` : ""}.
      </>
    ),
    parent: "Parent",
    email: "Email",
    phone: "Téléphone",
    cta: "Voir l'inscription",
    orLink: "Ou ouvrez ce lien :",
    subject: (participant: string, camp: string) =>
      `Nouvelle inscription — ${participant} (${camp})`,
  },
  en: {
    preview: (participant: string, camp: string) => `New registration: ${participant} — ${camp}`,
    brand: "Clubero · Camps",
    title: "New registration",
    body: (camp: string, club?: string) => (
      <>
        A new registration just came in for the camp <strong>{camp}</strong>
        {club ? ` (${club})` : ""}.
      </>
    ),
    parent: "Parent",
    email: "Email",
    phone: "Phone",
    cta: "View registration",
    orLink: "Or open this link:",
    subject: (participant: string, camp: string) => `New registration — ${participant} (${camp})`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const CampNewRegistration = ({
  campTitle,
  clubName,
  participantName,
  guardianName,
  guardianEmail,
  guardianPhone,
  manageUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  return (
    <EmailShell preview={t.preview(participantName, campTitle)} locale={l}>
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
      <Text style={text}>{t.body(campTitle, clubName)}</Text>
      <Section style={card}>
        <Text style={cardTitle}>{participantName}</Text>
        <Text style={cardLine}>
          {t.parent} : {guardianName}
        </Text>
        <Text style={cardLine}>
          {t.email} : {guardianEmail}
        </Text>
        {guardianPhone && (
          <Text style={cardLine}>
            {t.phone} : {guardianPhone}
          </Text>
        )}
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
  component: CampNewRegistration,
  subject: (data) => {
    const t = pick(pickLocale((data as { locale?: string }).locale));
    return t.subject(
      (data.participantName as string | undefined) ?? "",
      (data.campTitle as string | undefined) ?? "",
    );
  },
  displayName: "Camp new registration",
  previewData: {
    campTitle: "Stage de printemps U11",
    clubName: "FC Villeneuve",
    participantName: "Léo Dupont",
    guardianName: "Marie Dupont",
    guardianEmail: "marie@example.com",
    guardianPhone: "+33 6 12 34 56 78",
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
