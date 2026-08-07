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
import { resolveClubTz } from "@/lib/time/club-tz";

interface Props {
  tz?: string;
  recipientFirstName?: string | null;
  locale?: "fr" | "en";
  decision: "confirm" | "decline" | "unassign";
  needLabel: string;
  eventTitle: string;
  eventStartsAt?: string | null;
  clubName?: string | null;
  eventUrl: string;
}

const T = {
  fr: {
    previewConfirm: (label: string) => `Candidature confirmée : ${label}`,
    previewDecline: (label: string) => `Candidature déclinée : ${label}`,
    previewUnassign: (label: string) => `Ce n'est plus nécessaire : ${label}`,
    hello: (n?: string | null) => (n ? `Bonjour ${n},` : "Bonjour,"),
    introConfirm: (club: string | null | undefined, event: string) =>
      `${club ?? "Le club"} a confirmé ta candidature pour ${event}. Merci pour ton coup de main !`,
    introDecline: (club: string | null | undefined, event: string) =>
      `${club ?? "Le club"} n'a pas retenu ta candidature pour ${event}. Merci quand même de t'être proposé·e.`,
    introUnassign: (club: string | null | undefined, event: string) =>
      `${club ?? "Le club"} n'a finalement plus besoin de toi pour ${event}. Merci quand même de t'être rendu·e disponible !`,
    role: "Rôle",
    when: "Quand",
    cta: "Voir l'événement",
    footer: "Tu reçois cet email suite à ta candidature à un coup de main.",
  },
  en: {
    previewConfirm: (label: string) => `Application confirmed: ${label}`,
    previewDecline: (label: string) => `Application declined: ${label}`,
    previewUnassign: (label: string) => `No longer needed: ${label}`,
    hello: (n?: string | null) => (n ? `Hi ${n},` : "Hi,"),
    introConfirm: (club: string | null | undefined, event: string) =>
      `${club ?? "The club"} confirmed your application for ${event}. Thanks for helping out!`,
    introDecline: (club: string | null | undefined, event: string) =>
      `${club ?? "The club"} did not select your application for ${event}. Thanks for volunteering anyway.`,
    introUnassign: (club: string | null | undefined, event: string) =>
      `${club ?? "The club"} no longer needs you for ${event}. Thanks for making yourself available!`,
    role: "Role",
    when: "When",
    cta: "View event",
    footer: "You receive this email following your application to a help request.",
  },
} as const;

function fmtDate(iso: string | null | undefined, locale: "fr" | "en", tz?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: resolveClubTz(tz),
    });
  } catch {
    return null;
  }
}

const Email = ({
  recipientFirstName,
  locale = "fr",
  decision,
  needLabel,
  eventTitle,
  eventStartsAt,
  clubName,
  eventUrl,
  tz,
}: Props) => {
  const t = T[locale] ?? T.fr;
  const isConfirm = decision === "confirm";
  const isUnassign = decision === "unassign";
  const preview = isUnassign
    ? t.previewUnassign(needLabel)
    : isConfirm
      ? t.previewConfirm(needLabel)
      : t.previewDecline(needLabel);
  const intro = isUnassign
    ? t.introUnassign(clubName, eventTitle)
    : isConfirm
      ? t.introConfirm(clubName, eventTitle)
      : t.introDecline(clubName, eventTitle);
  const whenStr = fmtDate(eventStartsAt, locale, tz);
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{preview}</Heading>
          <Text style={text}>{t.hello(recipientFirstName)}</Text>
          <Text style={text}>{intro}</Text>
          <Section style={card}>
            <Text style={cardLabel}>{t.role}</Text>
            <Text style={cardValue}>{needLabel}</Text>
            {whenStr ? (
              <>
                <Text style={cardLabel}>{t.when}</Text>
                <Text style={cardHint}>{whenStr}</Text>
              </>
            ) : null}
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
    const t = T[loc];
    const label = (data.needLabel as string) ?? "";
    if (data.decision === "unassign") return t.previewUnassign(label);
    return data.decision === "confirm" ? t.previewConfirm(label) : t.previewDecline(label);
  },
  displayName: "Event need — decision",
  previewData: {
    recipientFirstName: "Alex",
    locale: "fr",
    decision: "confirm",
    needLabel: "Arbitre de touche",
    eventTitle: "U13 vs APM Metz",
    eventStartsAt: new Date().toISOString(),
    clubName: "ESAP",
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
  margin: "8px 0 4px 0",
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
