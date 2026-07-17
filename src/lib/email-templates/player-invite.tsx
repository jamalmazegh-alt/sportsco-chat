import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface PlayerInviteProps {
  firstName?: string;
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  inviteUrl: string;
  roleLabel?: string;
  playerFirstName?: string;
}

const PlayerInviteEmail = ({
  firstName,
  teamName,
  clubName,
  clubLogoUrl,
  inviteUrl,
  roleLabel,
  playerFirstName,
}: PlayerInviteProps) => {
  const club = clubName ?? "Votre club";
  const role = (roleLabel ?? "joueur").toLowerCase();
  const isParent = role === "parent";
  const isStaff = !!roleLabel && role !== "joueur" && !isParent;

  const roleSentence = isParent
    ? playerFirstName
      ? (
          <>
            <strong>{club}</strong> vous invite à rejoindre Clubero en tant que{" "}
            <strong>parent de {playerFirstName}</strong>
            {teamName ? (
              <>
                {" "}
                (équipe <strong>{teamName}</strong>)
              </>
            ) : null}
            .
          </>
        )
      : (
          <>
            <strong>{club}</strong> vous invite à rejoindre Clubero en tant que{" "}
            <strong>parent</strong>
            {teamName ? (
              <>
                {" "}
                d'un joueur de l'équipe <strong>{teamName}</strong>
              </>
            ) : null}
            .
          </>
        )
    : (
        <>
          <strong>{club}</strong> vous invite à rejoindre Clubero en tant que{" "}
          <strong>{role}</strong>
          {isStaff ? null : teamName ? (
            <>
              {" "}
              au sein de l'équipe <strong>{teamName}</strong>
            </>
          ) : null}
          .
        </>
      );

  const bodyText = isParent
    ? "Acceptez l'invitation pour créer votre compte parent : suivez les convocations, répondez pour votre enfant et restez informé de la vie du club."
    : isStaff
      ? "Acceptez l'invitation pour créer votre compte et accéder à votre espace d'encadrement : gestion des équipes, convocations, suivi des joueurs et événements du club."
      : "Acceptez l'invitation pour créer votre compte, consulter vos prochains événements et répondre à vos convocations.";

  return (
    <EmailShell
      preview={`${club} vous invite à rejoindre Clubero en tant que ${isParent && playerFirstName ? `parent de ${playerFirstName}` : role}`}
      locale="fr"
      clubName={clubName}
      clubLogoUrl={clubLogoUrl}
    >
      <Heading style={h1}>{firstName ? `Bonjour ${firstName},` : "Bonjour,"}</Heading>
      <Text style={text}>{roleSentence}</Text>
      <Text style={text}>{bodyText}</Text>
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
  component: PlayerInviteEmail,
  subject: (data) => {
    const club = data.clubName ?? "Votre club";
    const role = (data.roleLabel ?? "joueur").toLowerCase();
    if (role === "parent") {
      return data.playerFirstName
        ? `${club} vous invite sur Clubero en tant que parent de ${data.playerFirstName}`
        : `${club} vous invite sur Clubero en tant que parent`;
    }
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
