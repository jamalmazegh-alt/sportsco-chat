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
  status: "applied" | "confirmed";
  needLabel: string;
  eventTitle: string;
  eventStartsAt?: string | null;
  clubName?: string | null;
  applicantFirstName?: string | null;
  applicantLastName?: string | null;
  eventUrl: string;
}

const T = {
  fr: {
    previewConfirmed: (label: string) => `Volontaire confirmé : ${label}`,
    previewApplied: (label: string) => `Nouvelle candidature : ${label}`,
    hello: (n?: string | null) => (n ? `Bonjour ${n},` : "Bonjour,"),
    introConfirmed: (who: string, label: string, event: string) =>
      `${who} s'est inscrit·e pour "${label}" sur ${event}. C'est confirmé automatiquement.`,
    introApplied: (who: string, label: string, event: string) =>
      `${who} a candidaté pour "${label}" sur ${event}. À valider dans l'événement.`,
    role: "Rôle",
    when: "Quand",
    who: "Volontaire",
    cta: "Voir l'événement",
    footer: "Tu reçois cet email en tant que responsable du coup de main.",
  },
  en: {
    previewConfirmed: (label: string) => `Volunteer confirmed: ${label}`,
    previewApplied: (label: string) => `New application: ${label}`,
    hello: (n?: string | null) => (n ? `Hi ${n},` : "Hi,"),
    introConfirmed: (who: string, label: string, event: string) =>
      `${who} signed up for "${label}" on ${event}. Automatically confirmed.`,
    introApplied: (who: string, label: string, event: string) =>
      `${who} applied for "${label}" on ${event}. Review it in the event.`,
    role: "Role",
    when: "When",
    who: "Volunteer",
    cta: "View event",
    footer: "You receive this email as the owner of this help request.",
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
  status,
  needLabel,
  eventTitle,
  eventStartsAt,
  clubName,
  applicantFirstName,
  applicantLastName,
  eventUrl,
  tz,
}: Props) => {
  const t = T[locale] ?? T.fr;
  const isConfirmed = status === "confirmed";
  const whoName =
    [applicantFirstName, applicantLastName].filter(Boolean).join(" ") ||
    (locale === "en" ? "Someone" : "Quelqu'un");
  const preview = isConfirmed ? t.previewConfirmed(needLabel) : t.previewApplied(needLabel);
  const intro = isConfirmed
    ? t.introConfirmed(whoName, needLabel, eventTitle)
    : t.introApplied(whoName, needLabel, eventTitle);
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
            <Text style={cardLabel}>{t.who}</Text>
            <Text style={cardValue}>{whoName}</Text>
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
          <Text style={footer}>
            {clubName ? `${clubName} · ` : ""}
            {t.footer}
          </Text>
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
    return data.status === "confirmed" ? t.previewConfirmed(label) : t.previewApplied(label);
  },
  displayName: "Event need — signup received",
  previewData: {
    recipientFirstName: "David",
    locale: "fr",
    status: "confirmed",
    needLabel: "Délégué de match",
    eventTitle: "USAG UCKANGE U15 vs CSVE",
    eventStartsAt: new Date().toISOString(),
    clubName: "USAG",
    applicantFirstName: "Jamal",
    applicantLastName: "Mazegh",
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
