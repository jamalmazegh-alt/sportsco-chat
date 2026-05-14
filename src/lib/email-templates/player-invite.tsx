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
}

const PlayerInviteEmail = ({ firstName, teamName, clubName, clubLogoUrl, inviteUrl }: PlayerInviteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {clubName ? `${clubName} invited you to join` : "You've been invited to join Clubero"}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={clubHeader}>
          <Img
            src={clubLogoUrl || "https://www.clubero.app/clubero-logo.png"}
            alt={clubName ?? "Clubero"}
            width="64"
            height="64"
            style={clubLogo}
          />
          {clubName && <Text style={clubLabel}>{clubName}</Text>}
        </Section>
        <Heading style={h1}>
          {firstName ? `Welcome, ${firstName}!` : "You've been invited"}
        </Heading>
        <Text style={text}>
          {clubName ? <strong>{clubName}</strong> : "Your club"} has added you
          {teamName ? <> to <strong>{teamName}</strong></> : null} on Clubero.
          Accept your invitation to set up your account, view upcoming events
          and respond to convocations.
        </Text>
        <Button style={button} href={inviteUrl}>
          Accept invitation
        </Button>
        <Text style={small}>
          Or paste this link in your browser:<br />
          <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{inviteUrl}</span>
        </Text>
        <Text style={footer}>
          If you weren't expecting this, you can ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: PlayerInviteEmail,
  subject: (data) => data.clubName ? `${data.clubName} invited you on Clubero` : "Your Clubero invitation",
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
