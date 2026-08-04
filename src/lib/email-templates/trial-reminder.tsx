import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  recipientFirstName?: string;
  clubName: string;
  daysRemaining: number; // 7, 3, 1, or 0 (expired)
  trialEndDate: string;
  billingUrl: string;
  locale?: string;
}

const T = {
  fr: {
    hello: (n?: string) => (n ? `Bonjour ${n},` : "Bonjour,"),
    previewExpired: "Votre essai gratuit Clubero est terminé",
    previewOne: "Plus qu'1 jour d'essai gratuit Clubero",
    previewDays: (n: number) => `Plus que ${n} jours d'essai gratuit Clubero`,
    bodyExpired: (club: string) => (
      <>
        Votre période d'essai gratuite de 30 jours pour <strong>{club}</strong> sur Clubero est{" "}
        <strong>terminée</strong>.
      </>
    ),
    bodyActive: (club: string, when: string, date: string) => (
      <>
        Votre période d'essai gratuite pour <strong>{club}</strong> sur Clubero se termine {when} (
        {date}).
      </>
    ),
    whenTomorrow: "demain",
    whenDays: (n: number) => `dans ${n} jours`,
    kickerExpired: "ESSAI TERMINÉ",
    kickerOne: "PLUS QU'1 JOUR",
    kickerDays: (n: number) => `J-${n}`,
    cardTitleExpired: "Activez votre abonnement pour continuer",
    cardTitleActive: "Activez votre abonnement avant la fin de l'essai",
    cardMetaExpired:
      "La création de nouveaux événements est suspendue jusqu'à l'activation d'un abonnement.",
    cardMetaActive:
      "Vos données, équipes, joueurs et événements sont conservés. Activez votre abonnement pour continuer à créer des événements sans interruption.",
    ctaExpired: "Activer mon abonnement",
    ctaActive: "Voir les offres",
    help: "Une question ? Répondez simplement à cet e-mail ou écrivez-nous à hello@clubero.app.",
    subjectExpired: "⏰ Votre essai gratuit Clubero est terminé",
    subjectOne: "⏰ Plus qu'1 jour d'essai gratuit Clubero",
    subjectDays: (n: number) => `⏰ Plus que ${n} jours d'essai gratuit Clubero`,
  },
  en: {
    hello: (n?: string) => (n ? `Hi ${n},` : "Hi,"),
    previewExpired: "Your free Clubero trial has ended",
    previewOne: "1 day left on your free Clubero trial",
    previewDays: (n: number) => `${n} days left on your free Clubero trial`,
    bodyExpired: (club: string) => (
      <>
        Your 30-day free trial for <strong>{club}</strong> on Clubero has <strong>ended</strong>.
      </>
    ),
    bodyActive: (club: string, when: string, date: string) => (
      <>
        Your free trial for <strong>{club}</strong> on Clubero ends {when} ({date}).
      </>
    ),
    whenTomorrow: "tomorrow",
    whenDays: (n: number) => `in ${n} days`,
    kickerExpired: "TRIAL ENDED",
    kickerOne: "1 DAY LEFT",
    kickerDays: (n: number) => `D-${n}`,
    cardTitleExpired: "Activate your subscription to continue",
    cardTitleActive: "Activate your subscription before the trial ends",
    cardMetaExpired: "Creating new events is paused until a subscription is activated.",
    cardMetaActive:
      "Your data, teams, players and events are kept. Activate your subscription to keep creating events without interruption.",
    ctaExpired: "Activate my subscription",
    ctaActive: "View plans",
    help: "Questions? Just reply to this email or write to us at hello@clubero.app.",
    subjectExpired: "⏰ Your free Clubero trial has ended",
    subjectOne: "⏰ 1 day left on your free Clubero trial",
    subjectDays: (n: number) => `⏰ ${n} days left on your free Clubero trial`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const TrialReminderEmail = ({
  recipientFirstName,
  clubName,
  daysRemaining,
  trialEndDate,
  billingUrl,
  locale,
}: Props) => {
  const l = pickLocale(locale);
  const t = pick(l);
  const expired = daysRemaining <= 0;
  const urgent = daysRemaining <= 1 && !expired;
  const previewText = expired
    ? t.previewExpired
    : daysRemaining === 1
      ? t.previewOne
      : t.previewDays(daysRemaining);

  return (
    <EmailShell preview={previewText} locale={l} clubName={clubName}>
      <Heading style={h1}>{t.hello(recipientFirstName)}</Heading>

      {expired ? (
        <>
          <Text style={text}>{t.bodyExpired(clubName)}</Text>
          <Section style={cardRed}>
            <Text style={cardKickerRed}>{t.kickerExpired}</Text>
            <Text style={cardTitle}>{t.cardTitleExpired}</Text>
            <Text style={cardMeta}>{t.cardMetaExpired}</Text>
          </Section>
        </>
      ) : (
        <>
          <Text style={text}>
            {t.bodyActive(
              clubName,
              daysRemaining === 1 ? t.whenTomorrow : t.whenDays(daysRemaining),
              trialEndDate,
            )}
          </Text>
          <Section style={urgent ? cardOrange : cardBlue}>
            <Text style={urgent ? cardKickerOrange : cardKickerBlue}>
              {daysRemaining === 1 ? t.kickerOne : t.kickerDays(daysRemaining)}
            </Text>
            <Text style={cardTitle}>{t.cardTitleActive}</Text>
            <Text style={cardMeta}>{t.cardMetaActive}</Text>
          </Section>
        </>
      )}

      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={billingUrl} style={button}>
          {expired ? t.ctaExpired : t.ctaActive}
        </Button>
      </Section>

      <Text style={smallText}>{t.help}</Text>
    </EmailShell>
  );
};

export const template = {
  component: TrialReminderEmail,
  subject: (d) => {
    const t = pick(pickLocale((d as { locale?: string }).locale));
    const days = (d as { daysRemaining: number }).daysRemaining;
    if (days <= 0) return t.subjectExpired;
    if (days === 1) return t.subjectOne;
    return t.subjectDays(days);
  },
  displayName: "Trial reminder",
  previewData: {
    recipientFirstName: "Sophie",
    clubName: "AS Clubero",
    daysRemaining: 3,
    trialEndDate: "15 juin 2026",
    billingUrl: "https://www.clubero.app/admin/billing",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#334155", lineHeight: "1.55", margin: "0 0 16px" };
const smallText = { fontSize: "13px", color: "#64748b", lineHeight: "1.5", margin: "20px 0 0" };
const cardBlue = {
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "0 0 8px",
};
const cardOrange = {
  backgroundColor: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "0 0 8px",
};
const cardRed = {
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "0 0 8px",
};
const cardKickerBlue = {
  fontSize: "11px",
  letterSpacing: "1px",
  color: "#2563eb",
  fontWeight: "bold" as const,
  margin: "0 0 6px",
};
const cardKickerOrange = {
  fontSize: "11px",
  letterSpacing: "1px",
  color: "#c2410c",
  fontWeight: "bold" as const,
  margin: "0 0 6px",
};
const cardKickerRed = {
  fontSize: "11px",
  letterSpacing: "1px",
  color: "#dc2626",
  fontWeight: "bold" as const,
  margin: "0 0 6px",
};
const cardTitle = {
  fontSize: "16px",
  fontWeight: "bold" as const,
  color: "#0f172a",
  margin: "0 0 8px",
};
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
