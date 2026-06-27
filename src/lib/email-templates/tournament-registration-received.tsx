import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  organizerName?: string;
  tournamentName?: string;
  teamName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  manageUrl: string;
  requiresApproval?: boolean;
}

const TournamentRegistrationReceivedEmail = ({
  organizerName,
  tournamentName,
  teamName,
  contactName,
  contactEmail,
  contactPhone,
  manageUrl,
  requiresApproval = true,
}: Props) => {
  const tournament = tournamentName ?? "votre tournoi";
  return (
    <EmailShell preview={`Nouvelle inscription : ${teamName}`} locale="fr">
      <Section style={header}>
        <Img
          src="https://www.clubero.app/clubero-logo.png"
          alt="Clubero"
          width="56"
          height="56"
          style={logo}
        />
        <Text style={brand}>Clubero · Tournois</Text>
      </Section>
      <Heading style={h1}>{organizerName ? `Bonjour ${organizerName},` : "Bonjour,"}</Heading>
      <Text style={text}>
        Une nouvelle équipe vient de s'inscrire à <strong>{tournament}</strong> :
      </Text>
      <Section style={card}>
        <Text style={cardTitle}>{teamName}</Text>
        {contactName && <Text style={cardLine}>Contact : {contactName}</Text>}
        {contactEmail && <Text style={cardLine}>Email : {contactEmail}</Text>}
        {contactPhone && <Text style={cardLine}>Téléphone : {contactPhone}</Text>}
      </Section>
      <Text style={text}>
        {requiresApproval
          ? "Cette inscription est en attente de votre validation."
          : "L'équipe a été automatiquement ajoutée au tournoi."}
      </Text>
      <Button style={button} href={manageUrl}>
        {requiresApproval ? "Valider l'inscription" : "Voir l'équipe"}
      </Button>
      <Text style={small}>
        Ou ouvrez ce lien :<br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{manageUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: TournamentRegistrationReceivedEmail,
  subject: (data) => {
    const t = data.tournamentName ?? "votre tournoi";
    return `Nouvelle inscription — ${data.teamName} (${t})`;
  },
  displayName: "Tournament registration received",
  previewData: {
    organizerName: "Alex",
    tournamentName: "Coupe d'été 2026",
    teamName: "FC Nantes",
    contactName: "Marie Dupont",
    contactEmail: "marie@example.com",
    contactPhone: "+33 6 12 34 56 78",
    manageUrl: "https://clubero.app/tournaments/sample",
    requiresApproval: true,
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
