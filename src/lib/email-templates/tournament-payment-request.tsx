import * as React from "react";
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface TournamentPaymentRequestProps {
  teamName?: string;
  tournamentName?: string;
  amountLabel?: string;
  paymentUrl: string;
  expiresInDays?: number;
}

const TournamentPaymentRequestEmail = ({
  teamName,
  tournamentName,
  amountLabel,
  paymentUrl,
  expiresInDays,
}: TournamentPaymentRequestProps) => {
  const team = teamName ?? "votre équipe";
  const tournament = tournamentName ?? "le tournoi";
  const amount = amountLabel ?? "le montant indiqué";
  const days = expiresInDays ?? 7;
  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>{`Paiement inscription — ${tournament}`}</Preview>
      <Body style={main}>
        <Container style={container}>
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
          <Heading style={h1}>Bonjour {team},</Heading>
          <Text style={text}>
            Voici le lien de paiement pour finaliser votre inscription au tournoi <strong>{tournament}</strong>.
          </Text>
          <Text style={amountText}>{amount}</Text>
          <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
            <Button style={button} href={paymentUrl}>
              Payer maintenant
            </Button>
          </Section>
          <Text style={small}>
            Ou copiez ce lien dans votre navigateur :<br />
            <span style={{ wordBreak: "break-all", color: "#3b82f6" }}>{paymentUrl}</span>
          </Text>
          <Text style={footer}>
            Ce lien est valable {days} jours. Paiement sécurisé via Stripe.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TournamentPaymentRequestEmail,
  subject: (data) => {
    const t = data.tournamentName ?? "votre tournoi";
    return `Paiement inscription — ${t}`;
  },
  displayName: "Tournament registration payment request",
  previewData: {
    teamName: "FC Demo",
    tournamentName: "Coupe d'été 2026",
    amountLabel: "25,00 €",
    paymentUrl: "https://clubero.app/t/coupe-ete/pay/sample-id",
    expiresInDays: 7,
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const header = { textAlign: "center" as const, margin: "0 0 20px" };
const logo = { display: "inline-block", borderRadius: "12px", objectFit: "cover" as const };
const brand = { fontSize: "13px", fontWeight: "bold" as const, color: "#0f172a", margin: "8px 0 0", textAlign: "center" as const };
const h1 = { fontSize: "22px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 12px" };
const amountText = { fontSize: "26px", fontWeight: "bold" as const, color: "#0f172a", margin: "16px 0", textAlign: "center" as const };
const button = {
  backgroundColor: "#10b981",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "bold" as const,
  borderRadius: "10px",
  padding: "14px 28px",
  textDecoration: "none",
  display: "inline-block",
};
const small = { fontSize: "12px", color: "#64748b", margin: "20px 0 0", lineHeight: "1.5" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
