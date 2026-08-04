import * as React from "react";
import { Button, Heading, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface PlayerInviteProps {
  firstName?: string;
  teamName?: string;
  clubName?: string;
  clubLogoUrl?: string;
  inviteUrl: string;
  roleLabel?: string;
  playerFirstName?: string;
  locale?: string;
}

const T = {
  fr: {
    defaultClub: "Votre club",
    defaultRole: "joueur",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    preview: (club: string, rolePreview: string) =>
      `${club} vous invite à rejoindre Clubero en tant que ${rolePreview}`,
    parentOf: (player: string) => `parent de ${player}`,
    parent: "parent",
    inviteAs: (club: string, roleNode: React.ReactNode, teamSuffix: React.ReactNode) => (
      <>
        <strong>{club}</strong> vous invite à rejoindre Clubero en tant que {roleNode}
        {teamSuffix}.
      </>
    ),
    teamParen: (team: string) => (
      <>
        {" "}
        (équipe <strong>{team}</strong>)
      </>
    ),
    teamOfPlayer: (team: string) => (
      <>
        {" "}
        d'un joueur de l'équipe <strong>{team}</strong>
      </>
    ),
    teamWithin: (team: string) => (
      <>
        {" "}
        au sein de l'équipe <strong>{team}</strong>
      </>
    ),
    bodyParent:
      "Acceptez l'invitation pour créer votre compte parent : suivez les convocations, répondez pour votre enfant et restez informé de la vie du club.",
    bodyStaff:
      "Acceptez l'invitation pour créer votre compte et accéder à votre espace d'encadrement : gestion des équipes, convocations, suivi des joueurs et événements du club.",
    bodyPlayer:
      "Acceptez l'invitation pour créer votre compte, consulter vos prochains événements et répondre à vos convocations.",
    cta: "Accepter l'invitation",
    orLink: "Ou copiez ce lien dans votre navigateur :",
    subjectParentOf: (club: string, player: string) =>
      `${club} vous invite sur Clubero en tant que parent de ${player}`,
    subjectParent: (club: string) => `${club} vous invite sur Clubero en tant que parent`,
    subjectRole: (club: string, role: string) =>
      `${club} vous invite sur Clubero en tant que ${role}`,
  },
  en: {
    defaultClub: "Your club",
    defaultRole: "player",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    preview: (club: string, rolePreview: string) =>
      `${club} invites you to join Clubero as ${rolePreview}`,
    parentOf: (player: string) => `parent of ${player}`,
    parent: "parent",
    inviteAs: (club: string, roleNode: React.ReactNode, teamSuffix: React.ReactNode) => (
      <>
        <strong>{club}</strong> invites you to join Clubero as {roleNode}
        {teamSuffix}.
      </>
    ),
    teamParen: (team: string) => (
      <>
        {" "}
        (team <strong>{team}</strong>)
      </>
    ),
    teamOfPlayer: (team: string) => (
      <>
        {" "}
        of a player on team <strong>{team}</strong>
      </>
    ),
    teamWithin: (team: string) => (
      <>
        {" "}
        on team <strong>{team}</strong>
      </>
    ),
    bodyParent:
      "Accept the invitation to create your parent account: follow call-ups, respond for your child, and stay up to date with club life.",
    bodyStaff:
      "Accept the invitation to create your account and access your coaching space: team management, call-ups, player tracking, and club events.",
    bodyPlayer:
      "Accept the invitation to create your account, view upcoming events, and respond to your call-ups.",
    cta: "Accept invitation",
    orLink: "Or copy this link into your browser:",
    subjectParentOf: (club: string, player: string) =>
      `${club} invites you to Clubero as parent of ${player}`,
    subjectParent: (club: string) => `${club} invites you to Clubero as a parent`,
    subjectRole: (club: string, role: string) => `${club} invites you to Clubero as ${role}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const localizeRole = (roleLabel: string | undefined, l: Locale): string => {
  const raw = (roleLabel ?? pick(l).defaultRole).toLowerCase();
  if (raw === "joueur" || raw === "player") return pick(l).defaultRole;
  if (raw === "parent") return pick(l).parent;
  return roleLabel ?? pick(l).defaultRole;
};

const PlayerInviteEmail = ({
  firstName,
  teamName,
  clubName,
  clubLogoUrl,
  inviteUrl,
  roleLabel,
  playerFirstName,
  locale,
}: PlayerInviteProps) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const club = clubName ?? t.defaultClub;
  const roleRaw = (roleLabel ?? t.defaultRole).toLowerCase();
  const isParent = roleRaw === "parent";
  const isPlayer = roleRaw === "joueur" || roleRaw === "player";
  const isStaff = !!roleLabel && !isPlayer && !isParent;
  const role = localizeRole(roleLabel, l);

  const rolePreview =
    isParent && playerFirstName ? t.parentOf(playerFirstName) : isParent ? t.parent : role;

  const roleNode = isParent ? (
    playerFirstName ? (
      <strong>{t.parentOf(playerFirstName)}</strong>
    ) : (
      <strong>{t.parent}</strong>
    )
  ) : (
    <strong>{role}</strong>
  );

  let teamSuffix: React.ReactNode = null;
  if (isParent) {
    if (playerFirstName && teamName) teamSuffix = t.teamParen(teamName);
    else if (!playerFirstName && teamName) teamSuffix = t.teamOfPlayer(teamName);
  } else if (!isStaff && teamName) {
    teamSuffix = t.teamWithin(teamName);
  }

  const bodyText = isParent ? t.bodyParent : isStaff ? t.bodyStaff : t.bodyPlayer;

  return (
    <EmailShell
      preview={t.preview(club, rolePreview)}
      locale={l}
      clubName={clubName}
      clubLogoUrl={clubLogoUrl}
    >
      <Heading style={h1}>{t.hello(firstName)}</Heading>
      <Text style={text}>{t.inviteAs(club, roleNode, teamSuffix)}</Text>
      <Text style={text}>{bodyText}</Text>
      <Button style={button} href={inviteUrl}>
        {t.cta}
      </Button>
      <Text style={small}>
        {t.orLink}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{inviteUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: PlayerInviteEmail,
  subject: (data) => {
    const l = pickLocale((data as { locale?: string }).locale);
    const t = pick(l);
    const club = (data.clubName as string | undefined) ?? t.defaultClub;
    const roleRaw = ((data.roleLabel as string | undefined) ?? t.defaultRole).toLowerCase();
    if (roleRaw === "parent") {
      return data.playerFirstName
        ? t.subjectParentOf(club, data.playerFirstName as string)
        : t.subjectParent(club);
    }
    return t.subjectRole(club, localizeRole(data.roleLabel as string | undefined, l));
  },
  displayName: "Player invitation",
  previewData: {
    firstName: "Alex",
    teamName: "U13 A",
    clubName: "AS Clubero",
    clubLogoUrl: "https://www.clubero.app/clubero-logo.png",
    inviteUrl: "https://clubero.app/register?invite=sample-token",
    locale: "fr",
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
