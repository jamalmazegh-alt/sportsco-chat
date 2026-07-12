import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  guardianFirstName?: string;
  participantName: string;
  campTitle: string;
  clubName: string;
  documentLabel: string;
  rejectionReason: string;
  trackingUrl?: string;
}

const CampDocumentRejected = ({
  guardianFirstName,
  participantName,
  campTitle,
  clubName,
  documentLabel,
  rejectionReason,
  trackingUrl,
}: Props) => {
  return (
    <EmailShell preview={`Document à renvoyer — ${campTitle}`} locale="fr">
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
        Un document du dossier de <strong>{participantName}</strong> pour le stage
        <strong> {campTitle}</strong> ({clubName}) a été <strong>refusé</strong> par le club.
      </Text>
      <Section style={card}>
        <Text style={cardLabel}>Document concerné</Text>
        <Text style={cardValue}>{documentLabel}</Text>
        <Text style={cardLabel}>Motif du refus</Text>
        <Text style={cardValue}>{rejectionReason}</Text>
      </Section>
      <Text style={text}>
        Merci de renvoyer une nouvelle version depuis votre espace de suivi personnel :
      </Text>
      {trackingUrl && (
        <>
          <Button style={button} href={trackingUrl}>
            Renvoyer le document
          </Button>
          <Text style={small}>
            Ou ouvrez ce lien :<br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{trackingUrl}</span>
            <br />
            <em>Ce lien est personnel — ne le partagez pas.</em>
          </Text>
        </>
      )}
      <Text style={small}>
        Une question sur ce refus ? Répondez directement au club organisateur.
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: CampDocumentRejected,
  subject: (data) => `Document à renvoyer — ${data.campTitle ?? "stage"}`,
  displayName: "Camp document rejected",
  previewData: {
    guardianFirstName: "Marie",
    participantName: "Léo Dupont",
    campTitle: "Stage de printemps U11",
    clubName: "FC Villeneuve",
    documentLabel: "Certificat médical",
    rejectionReason: "Le document est illisible, merci d'envoyer un scan de meilleure qualité.",
    trackingUrl: "https://clubero.app/stages/fc-villeneuve/stage-printemps/suivi/token",
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
