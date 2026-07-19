import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  recipientFirstName?: string | null;
  locale?: "fr" | "en";
  needLabel: string;
  eventTitle: string;
  eventStartsAt?: string | null;
  teamName?: string | null;
  clubName?: string | null;
  capacity?: number | null;
  validationMode?: "auto" | "manual" | null;
  eventUrl: string;
}

const T = {
  fr: {
    preview: (label: string) => `Coup de main demandé : ${label}`,
    hello: (n?: string | null) => (n ? `Bonjour ${n},` : "Bonjour,"),
    intro: (club: string | null | undefined, event: string, role: string) =>
      `${club ?? "Le club"} a besoin d'un coup de main sur l'événement « ${event} » — rôle recherché : ${role}.`,
    role: "Rôle demandé",
    seats: (n: number) => `${n} place${n > 1 ? "s" : ""} à pourvoir`,
    auto: "Ta candidature sera confirmée automatiquement (dans la limite des places).",
    manual: "Le staff validera ta candidature.",
    cta: "Voir l'événement",
    footer: "Tu reçois cet email parce que tu es membre du club et concerné par cet appel.",
  },
  en: {
    preview: (label: string) => `Volunteer request: ${label}`,
    hello: (n?: string | null) => (n ? `Hi ${n},` : "Hi,"),
    intro: (club: string | null | undefined, event: string, role: string) =>
      `${club ?? "The club"} needs a hand for "${event}" — role needed: ${role}.`,
    role: "Requested role",
    seats: (n: number) => `${n} seat${n > 1 ? "s" : ""} to fill`,
    auto: "Your application will be auto-confirmed (up to capacity).",
    manual: "Staff will review your application.",
    cta: "View event",
    footer: "You receive this email because you are a club member concerned by this request.",
  },
} as const;

const Email = ({
  recipientFirstName,
  locale = "fr",
  needLabel,
  eventTitle,
  teamName,
  clubName,
  capacity,
  validationMode,
  eventUrl,
}: Props) => {
  const t = T[locale] ?? T.fr;
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{t.preview(needLabel)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{t.preview(needLabel)}</Heading>
          <Text style={text}>{t.hello(recipientFirstName)}</Text>
          <Text style={text}>{t.intro(clubName ?? teamName, eventTitle)}</Text>
          <Section style={card}>
            <Text style={cardLabel}>{t.role}</Text>
            <Text style={cardValue}>{needLabel}</Text>
            {typeof capacity === "number" && capacity > 0 ? (
              <Text style={cardHint}>{t.seats(capacity)}</Text>
            ) : null}
            <Text style={cardHint}>
              {validationMode === "auto" ? t.auto : t.manual}
            </Text>
          </Section>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button href={eventUrl} style={btn}>
              {t.cta}
            </Button>
          </Section>
          <Text style={footer}>{t.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const loc = (data.locale as string) === "en" ? "en" : "fr";
    return T[loc].preview((data.needLabel as string) ?? "");
  },
  displayName: "Event need — invite",
  previewData: {
    recipientFirstName: "Alex",
    locale: "fr",
    needLabel: "Arbitre de touche",
    eventTitle: "U13 vs APM Metz",
    teamName: "U13",
    clubName: "ESAP",
    capacity: 2,
    validationMode: "manual",
    eventUrl: "https://clubero.app/events/x",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const h1 = { fontSize: "20px", color: "#0f172a", margin: "0 0 12px 0" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "22px" };
const card = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};
const cardLabel = {
  fontSize: "11px",
  textTransform: "uppercase" as const,
  color: "#64748b",
  margin: "0 0 4px 0",
  letterSpacing: "0.05em",
};
const cardValue = { fontSize: "16px", color: "#0f172a", margin: "0 0 8px 0", fontWeight: 600 };
const cardHint = { fontSize: "13px", color: "#475569", margin: "4px 0 0 0" };
const btn = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "6px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 600,
};
const footer = { fontSize: "12px", color: "#94a3b8", marginTop: "24px" };
