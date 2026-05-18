import * as React from "react";
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface PlayerInviteProps {
  firstName?: string;
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  inviteUrl: string;
  roleLabel?: string;
}

const PlayerInviteEmail = ({ firstName, teamName, clubName, clubLogoUrl, inviteUrl, roleLabel }: PlayerInviteProps) => {
  const club = clubName ?? "Votre club";
  const isStaff = !!roleLabel && roleLabel.toLowerCase() !== "joueur";
  const role = roleLabel ?? "joueur";
  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>
        {`${club} vous invite à rejoindre Clubero en tant que ${role}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={clubHeader}>
            <Img
              src={clubLogoUrl || "https://www.clubero.app/clubero-logo.png"}
              alt={club}
              width="64"
              height="64"
              style={clubLogo}
            />
            <Text style={clubLabel}>{club}</Text>
          </Section>
          <Heading style={h1}>
            {firstName ? `Bonjour ${firstName},` : "Bonjour,"}
          </Heading>
          <Text style={text}>
            <strong>{club}</strong> vous invite à rejoindre Clubero en tant que <strong>{role}</strong>
            {isStaff ? null : teamName ? <> au sein de l'équipe <strong>{teamName}</strong></> : null}.
          </Text>
          <Text style={text}>
            {isStaff
              ? "Acceptez l'invitation pour créer votre compte et accéder à votre espace d'encadrement : gestion des équipes, convocations, suivi des joueurs et événements du club."
              : "Acceptez l'invitation pour créer votre compte, consulter vos prochains événements et répondre à vos convocations."}
          </Text>
          <Button style={button} href={inviteUrl}>
            Accepter l'invitation
          </Button>
          <Text style={small}>
            Ou copiez ce lien dans votre navigateur :<br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{inviteUrl}</span>
          </Text>
          <Text style={footer}>
            Si vous n'attendiez pas cet email, vous pouvez l'ignorer.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: PlayerInviteEmail,
  subject: (data) => {
    const club = data.clubName ?? "Votre club";
    const role = data.roleLabel ?? "joueur";
    return `${club} vous invite sur Clubero en tant que ${role}`;
  },
  displayName: "Player invitation",
  previewData: {
    firstName: "Alex",
    teamName: "U13 A",
    clubName: "AS Clubero",
    clubLogoUrl: "https://www.clubero.app/clubero-logo.png",
    inviteUrl: "https://clubero.app/register?invite=sample-token",
  },
} satisfies TemplateEntry;


const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 24px" };
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
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
const clubHeader = { textAlign: "center" as const, margin: "0 0 20px" };
const clubLogo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const clubLabel = { fontSize: "13px", fontWeight: "bold" as const, color: "#0f172a", margin: "8px 0 0", textAlign: "center" as const };
