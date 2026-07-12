import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  campTitle: string;
  clubName?: string;
  participantName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone?: string;
  manageUrl: string;
}

const CampNewRegistration = ({
  campTitle,
  clubName,
  participantName,
  guardianName,
  guardianEmail,
  guardianPhone,
  manageUrl,
}: Props) => (
  <EmailShell preview={`Nouvelle inscription : ${participantName} — ${campTitle}`} locale="fr">
    <Section style={header}>
      <Img
        src="https://www.clubero.app/clubero-logo.png"
        alt="Clubero"
        width="56"
        height="56"
        style={logo}
      />
      <Text style={brand}>Clubero · Stages</Text>
    </Section>
    <Heading style={h1}>Nouvelle inscription</Heading>
    <Text style={text}>
      Une nouvelle inscription vient d'arriver pour le stage <strong>{campTitle}</strong>
      {clubName ? ` (${clubName})` : ""}.
    </Text>
    <Section style={card}>
      <Text style={cardTitle}>{participantName}</Text>
      <Text style={cardLine}>Parent : {guardianName}</Text>
      <Text style={cardLine}>Email : {guardianEmail}</Text>
      {guardianPhone && <Text style={cardLine}>Téléphone : {guardianPhone}</Text>}
    </Section>
    <Button style={button} href={manageUrl}>
      Voir l'inscription
    </Button>
    <Text style={small}>
      Ou ouvrez ce lien :<br />
      <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{manageUrl}</span>
    </Text>
  </EmailShell>
);

export const template = {
  component: CampNewRegistration,
  subject: (data) =>
    `Nouvelle inscription — ${data.participantName ?? ""} (${data.campTitle ?? ""})`,
  displayName: "Camp new registration",
  previewData: {
    campTitle: "Stage de printemps U11",
    clubName: "FC Villeneuve",
    participantName: "Léo Dupont",
    guardianName: "Marie Dupont",
    guardianEmail: "marie@example.com",
    guardianPhone: "+33 6 12 34 56 78",
    manageUrl: "https://clubero.app/admin/stages/sample",
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
