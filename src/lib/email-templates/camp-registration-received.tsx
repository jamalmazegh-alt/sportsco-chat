import * as React from "react";
import { Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  guardianFirstName?: string;
  participantName: string;
  campTitle: string;
  clubName: string;
  campStartDate?: string;
  campEndDate?: string;
  referenceId?: string;
}

const CampRegistrationReceived = ({
  guardianFirstName,
  participantName,
  campTitle,
  clubName,
  campStartDate,
  campEndDate,
  referenceId,
}: Props) => {
  const dates =
    campStartDate && campEndDate
      ? `${new Date(campStartDate).toLocaleDateString("fr-FR")} → ${new Date(campEndDate).toLocaleDateString("fr-FR")}`
      : null;
  return (
    <EmailShell preview={`Inscription bien reçue — ${campTitle}`} locale="fr">
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
      <Heading style={h1}>
        {guardianFirstName ? `Bonjour ${guardianFirstName},` : "Bonjour,"}
      </Heading>
      <Text style={text}>
        Nous avons bien reçu l'inscription de <strong>{participantName}</strong> au stage
        <strong> {campTitle}</strong> organisé par <strong>{clubName}</strong>.
      </Text>
      <Section style={card}>
        <Text style={cardLine}>Stage : {campTitle}</Text>
        <Text style={cardLine}>Enfant : {participantName}</Text>
        {dates && <Text style={cardLine}>Dates : {dates}</Text>}
        {referenceId && <Text style={cardLine}>Référence : {referenceId}</Text>}
      </Section>
      <Text style={text}>
        Votre dossier est en attente de validation par le club. Vous recevrez un email dès qu'il
        aura été traité.
      </Text>
      <Text style={small}>
        Si vous n'êtes pas à l'origine de cette inscription, vous pouvez ignorer cet email.
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: CampRegistrationReceived,
  subject: (data) => `Inscription bien reçue — ${data.campTitle ?? "stage"}`,
  displayName: "Camp registration received",
  previewData: {
    guardianFirstName: "Marie",
    participantName: "Léo Dupont",
    campTitle: "Stage de printemps U11",
    clubName: "FC Villeneuve",
    campStartDate: new Date().toISOString(),
    campEndDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    referenceId: "AB12CD34",
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
const small = { fontSize: "12px", color: "#64748b", margin: "20px 0 0", lineHeight: "1.5" };
