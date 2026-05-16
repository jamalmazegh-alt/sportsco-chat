import * as React from "react";
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  recipientFirstName?: string;
  clubName: string;
  daysRemaining: number; // 7, 3, 1, or 0 (expired)
  trialEndDate: string;
  billingUrl: string;
}

const TrialReminderEmail = ({
  recipientFirstName,
  clubName,
  daysRemaining,
  trialEndDate,
  billingUrl,
}: Props) => {
  const expired = daysRemaining <= 0;
  const urgent = daysRemaining <= 1 && !expired;
  const previewText = expired
    ? `Votre essai gratuit Clubero est terminé`
    : daysRemaining === 1
      ? `Plus qu'1 jour d'essai gratuit Clubero`
      : `Plus que ${daysRemaining} jours d'essai gratuit Clubero`;

  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {recipientFirstName ? `Bonjour ${recipientFirstName},` : "Bonjour,"}
          </Heading>

          {expired ? (
            <>
              <Text style={text}>
                Votre période d'essai gratuite de 30 jours pour <strong>{clubName}</strong> sur
                Clubero est <strong>terminée</strong>.
              </Text>
              <Section style={cardRed}>
                <Text style={cardKickerRed}>ESSAI TERMINÉ</Text>
                <Text style={cardTitle}>Activez votre abonnement pour continuer</Text>
                <Text style={cardMeta}>
                  La création de nouveaux événements est suspendue jusqu'à l'activation d'un
                  abonnement.
                </Text>
              </Section>
            </>
          ) : (
            <>
              <Text style={text}>
                Votre période d'essai gratuite pour <strong>{clubName}</strong> sur Clubero se
                termine {daysRemaining === 1 ? "demain" : `dans ${daysRemaining} jours`} (
                {trialEndDate}).
              </Text>
              <Section style={urgent ? cardOrange : cardBlue}>
                <Text style={urgent ? cardKickerOrange : cardKickerBlue}>
                  {daysRemaining === 1 ? "PLUS QU'1 JOUR" : `J-${daysRemaining}`}
                </Text>
                <Text style={cardTitle}>Activez votre abonnement avant la fin de l'essai</Text>
                <Text style={cardMeta}>
                  Vos données, équipes, joueurs et événements sont conservés. Activez votre
                  abonnement pour continuer à créer des événements sans interruption.
                </Text>
              </Section>
            </>
          )}

          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button href={billingUrl} style={button}>
              {expired ? "Activer mon abonnement" : "Voir les offres"}
            </Button>
          </Section>

          <Text style={smallText}>
            Une question ? Répondez simplement à cet e-mail ou écrivez-nous à hello@clubero.app.
          </Text>

          <Text style={footer}>Clubero — la plateforme des clubs sportifs amateurs</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: TrialReminderEmail,
  subject: (d) =>
    d.daysRemaining <= 0
      ? `⏰ Votre essai gratuit Clubero est terminé`
      : d.daysRemaining === 1
        ? `⏰ Plus qu'1 jour d'essai gratuit Clubero`
        : `⏰ Plus que ${d.daysRemaining} jours d'essai gratuit Clubero`,
  displayName: "Trial reminder",
  previewData: {
    recipientFirstName: "Sophie",
    clubName: "AS Clubero",
    daysRemaining: 3,
    trialEndDate: "15 juin 2026",
    billingUrl: "https://www.clubero.app/admin/billing",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 16px" };
const smallText = { fontSize: "13px", color: "#64748b", lineHeight: "1.5", margin: "20px 0 0" };
const cardBlue = { backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "16px 18px", margin: "0 0 8px" };
const cardOrange = { backgroundColor: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "16px 18px", margin: "0 0 8px" };
const cardRed = { backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "16px 18px", margin: "0 0 8px" };
const cardKickerBlue = { fontSize: "11px", letterSpacing: "1px", color: "#2563eb", fontWeight: "bold" as const, margin: "0 0 6px" };
const cardKickerOrange = { fontSize: "11px", letterSpacing: "1px", color: "#c2410c", fontWeight: "bold" as const, margin: "0 0 6px" };
const cardKickerRed = { fontSize: "11px", letterSpacing: "1px", color: "#dc2626", fontWeight: "bold" as const, margin: "0 0 6px" };
const cardTitle = { fontSize: "16px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 8px" };
const cardMeta = { fontSize: "13px", color: "#475569", margin: 0, lineHeight: "1.5" };
const button = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "8px",
  fontWeight: "bold" as const,
  fontSize: "14px",
  textDecoration: "none",
  display: "inline-block",
};
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0", textAlign: "center" as const };
