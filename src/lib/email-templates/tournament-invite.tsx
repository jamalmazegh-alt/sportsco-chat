import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface TournamentInviteProps {
  displayName?: string;
  tournamentName?: string;
  roleLabel?: string;
  inviterName?: string;
  inviteUrl: string;
}

const TournamentInviteEmail = ({
  displayName,
  tournamentName,
  roleLabel,
  inviterName,
  inviteUrl,
}: TournamentInviteProps) => {
  const tournament = tournamentName ?? "un tournoi";
  const role = roleLabel ?? "collaborateur";
  return (
    <EmailShell preview={`Vous êtes invité comme ${role} sur ${tournament}`} locale="fr">
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
            {displayName ? `Bonjour ${displayName},` : "Bonjour,"}
          </Heading>
          <Text style={text}>
            {inviterName ? <><strong>{inviterName}</strong> vous invite</> : "Vous êtes invité"} à rejoindre l'organisation du tournoi <strong>{tournament}</strong> en tant que <strong>{role}</strong>.
          </Text>
          <Text style={text}>
            {role.toLowerCase().includes("arbitre")
              ? "En tant qu'arbitre, vous pourrez saisir les scores et valider les matchs qui vous sont assignés."
              : "En tant que co-organisateur, vous disposerez de droits complets sur la gestion du tournoi."}
          </Text>
          <Button style={button} href={inviteUrl}>
            Accepter l'invitation
          </Button>
          <Text style={small}>
            Ou copiez ce lien dans votre navigateur :<br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{inviteUrl}</span>
          </Text>
          </EmailShell>
  );
};

export const template = {
  component: TournamentInviteEmail,
  subject: (data) => {
    const t = data.tournamentName ?? "un tournoi";
    const r = data.roleLabel ?? "collaborateur";
    return `Invitation : ${r} sur ${t}`;
  },
  displayName: "Tournament collaborator invitation",
  previewData: {
    displayName: "Alex",
    tournamentName: "Coupe d'été 2026",
    roleLabel: "arbitre",
    inviterName: "Jean Dupont",
    inviteUrl: "https://clubero.app/tournament-invite/sample-token",
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
