import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  contactName?: string;
  tournamentName?: string;
  teamName?: string;
  rosterUrl: string;
  status?: "approved" | "pending";
}

const TournamentRosterLinkEmail = ({
  contactName,
  tournamentName,
  teamName,
  rosterUrl,
  status = "approved",
}: Props) => {
  const tournament = tournamentName ?? "votre tournoi";
  const team = teamName ?? "votre équipe";
  return (
    <EmailShell preview={`Composez l'effectif de ${team}`} locale="fr">
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
          <Heading style={h1}>
            {contactName ? `Bonjour ${contactName},` : "Bonjour,"}
          </Heading>
          {status === "approved" ? (
            <Text style={text}>
              Bonne nouvelle ! La candidature de <strong>{team}</strong> pour <strong>{tournament}</strong> a été validée.
            </Text>
          ) : (
            <Text style={text}>
              Votre inscription de <strong>{team}</strong> pour <strong>{tournament}</strong> est bien enregistrée.
            </Text>
          )}
          <Text style={text}>
            Vous pouvez désormais composer l'effectif de votre équipe en quelques clics. Ce lien est personnel — conservez-le précieusement, il vous permettra de modifier la liste à tout moment.
          </Text>
          <Button style={button} href={rosterUrl}>
            Composer l'effectif
          </Button>
          <Text style={small}>
            Ou copiez ce lien dans votre navigateur :<br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{rosterUrl}</span>
          </Text>
          </EmailShell>
  );
};

export const template = {
  component: TournamentRosterLinkEmail,
  subject: (data) => {
    const t = data.tournamentName ?? "votre tournoi";
    return `Composez l'effectif de votre équipe — ${t}`;
  },
  displayName: "Tournament roster link",
  previewData: {
    contactName: "Alex",
    tournamentName: "Coupe d'été 2026",
    teamName: "Les Lions",
    rosterUrl: "https://clubero.app/tournament/coupe/roster/sample-token",
    status: "approved" as const,
  },
} satisfies TemplateEntry;

const header = { textAlign: "center" as const, margin: "0 0 20px" };
const logo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const brand = { fontSize: "13px", fontWeight: "bold" as const, color: "#0f172a", margin: "8px 0 0", textAlign: "center" as const };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 20px" };
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
