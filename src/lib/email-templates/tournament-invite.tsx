import * as React from "react";
import { Button, Heading, Img, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface TournamentInviteProps {
  displayName?: string;
  tournamentName?: string;
  roleLabel?: string;
  inviterName?: string;
  inviteUrl: string;
  locale?: string;
}

const T = {
  fr: {
    defaultTournament: "un tournoi",
    defaultRole: "collaborateur",
    preview: (role: string, tournament: string) =>
      `Vous êtes invité comme ${role} sur ${tournament}`,
    brand: "Clubero · Tournois",
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    inviterInvite: (name: string) => (
      <>
        <strong>{name}</strong> vous invite
      </>
    ),
    youAreInvited: "Vous êtes invité",
    body: (tournament: string, role: string, inviteLead: React.ReactNode) => (
      <>
        {inviteLead} à rejoindre l'organisation du tournoi <strong>{tournament}</strong> en tant que{" "}
        <strong>{role}</strong>.
      </>
    ),
    roleReferee:
      "En tant qu'arbitre, vous pourrez saisir les scores et valider les matchs qui vous sont assignés.",
    roleOrganizer:
      "En tant que co-organisateur, vous disposerez de droits complets sur la gestion du tournoi.",
    cta: "Accepter l'invitation",
    createAccount:
      "Si vous n'avez pas encore de compte Clubero, vous serez invité à le créer avec cette adresse email avant d'accepter l'invitation.",
    orLink: "Ou copiez ce lien dans votre navigateur :",
    subject: (role: string, tournament: string) => `Invitation : ${role} sur ${tournament}`,
  },
  en: {
    defaultTournament: "a tournament",
    defaultRole: "collaborator",
    preview: (role: string, tournament: string) => `You're invited as ${role} on ${tournament}`,
    brand: "Clubero · Tournaments",
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    inviterInvite: (name: string) => (
      <>
        <strong>{name}</strong> invites you
      </>
    ),
    youAreInvited: "You're invited",
    body: (tournament: string, role: string, inviteLead: React.ReactNode) => (
      <>
        {inviteLead} to join the organization of tournament <strong>{tournament}</strong> as{" "}
        <strong>{role}</strong>.
      </>
    ),
    roleReferee:
      "As a referee, you'll be able to enter scores and validate the matches assigned to you.",
    roleOrganizer: "As a co-organizer, you'll have full rights to manage the tournament.",
    cta: "Accept invitation",
    createAccount:
      "If you don't have a Clubero account yet, you'll be asked to create one with this email address before accepting the invitation.",
    orLink: "Or copy this link into your browser:",
    subject: (role: string, tournament: string) => `Invitation: ${role} on ${tournament}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const isRefereeRole = (role: string) => {
  const r = role.toLowerCase();
  return r.includes("arbitre") || r.includes("referee");
};

const TournamentInviteEmail = ({
  displayName,
  tournamentName,
  roleLabel,
  inviterName,
  inviteUrl,
  locale,
}: TournamentInviteProps) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const tournament = tournamentName ?? t.defaultTournament;
  const role = roleLabel ?? t.defaultRole;
  const inviteLead = inviterName ? t.inviterInvite(inviterName) : t.youAreInvited;

  return (
    <EmailShell preview={t.preview(role, tournament)} locale={l}>
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
      <Heading style={h1}>{t.hello(displayName)}</Heading>
      <Text style={text}>{t.body(tournament, role, inviteLead)}</Text>
      <Text style={text}>{isRefereeRole(role) ? t.roleReferee : t.roleOrganizer}</Text>
      <Button style={button} href={inviteUrl}>
        {t.cta}
      </Button>
      <Text style={text}>{t.createAccount}</Text>
      <Text style={small}>
        {t.orLink}
        <br />
        <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{inviteUrl}</span>
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: TournamentInviteEmail,
  subject: (data) => {
    const l = pickLocale((data as { locale?: string }).locale);
    const t = pick(l);
    const tournament = (data.tournamentName as string | undefined) ?? t.defaultTournament;
    const role = (data.roleLabel as string | undefined) ?? t.defaultRole;
    return t.subject(role, tournament);
  },
  displayName: "Tournament collaborator invitation",
  previewData: {
    displayName: "Alex",
    tournamentName: "Coupe d'été 2026",
    roleLabel: "arbitre",
    inviterName: "Jean Dupont",
    inviteUrl: "https://clubero.app/tournament-invite/sample-token",
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
