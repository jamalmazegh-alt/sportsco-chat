import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

type EventType =
  | "created"
  | "trial_started"
  | "canceled"
  | "cancellation_scheduled"
  | "reactivated"
  | "payment_failed";

interface Props {
  eventType: EventType;
  clubName?: string;
  clubId?: string;
  plan?: string | null;
  status?: string | null;
  customerEmail?: string | null;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  cancelAt?: string | null;
  stripeSubscriptionId?: string | null;
  locale?: string;
}

const T = {
  fr: {
    labels: {
      created: "Nouvel abonnement",
      trial_started: "Début de période d'essai",
      canceled: "Abonnement annulé",
      cancellation_scheduled: "Résiliation programmée",
      reactivated: "Abonnement réactivé",
      payment_failed: "Échec de paiement",
    } as Record<EventType, string>,
    fallback: "Mise à jour abonnement",
    club: "Club",
    plan: "Plan",
    status: "Statut Stripe",
    customerEmail: "Email client",
    trialEnd: "Fin essai",
    periodEnd: "Fin période",
    cancelAt: "Annulation prévue",
    subscriptionId: "Subscription ID",
    clubId: "Club ID",
    subject: (label: string, club: string) => `[Clubero] ${label} — ${club}`,
  },
  en: {
    labels: {
      created: "New subscription",
      trial_started: "Trial period started",
      canceled: "Subscription canceled",
      cancellation_scheduled: "Cancellation scheduled",
      reactivated: "Subscription reactivated",
      payment_failed: "Payment failed",
    } as Record<EventType, string>,
    fallback: "Subscription update",
    club: "Club",
    plan: "Plan",
    status: "Stripe status",
    customerEmail: "Customer email",
    trialEnd: "Trial end",
    periodEnd: "Period end",
    cancelAt: "Scheduled cancellation",
    subscriptionId: "Subscription ID",
    clubId: "Club ID",
    subject: (label: string, club: string) => `[Clubero] ${label} — ${club}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

function fmt(d: string | null | undefined, locale: Locale) {
  if (!d) return "—";
  try {
    const bcp = locale === "en" ? "en-GB" : "fr-FR";
    return new Date(d).toLocaleString(bcp);
  } catch {
    return d;
  }
}

const SubscriptionAdminNotification = (props: Props) => {
  const l = pickLocale(props.locale);
  const t = pick(l);
  const label = t.labels[props.eventType] ?? props.eventType;
  return (
    <EmailShell
      preview={`${label} — ${props.clubName ?? "Club"}`}
      locale={l}
      clubName={props.clubName}
    >
      <Heading style={h1}>{label}</Heading>
      <Text style={text}>
        {t.club} : <strong>{props.clubName ?? "—"}</strong>
      </Text>
      <Section style={card}>
        <Row k={t.plan} v={props.plan ?? "—"} />
        <Row k={t.status} v={props.status ?? "—"} />
        <Row k={t.customerEmail} v={props.customerEmail ?? "—"} />
        <Row k={t.trialEnd} v={fmt(props.trialEnd, l)} />
        <Row k={t.periodEnd} v={fmt(props.currentPeriodEnd, l)} />
        <Row k={t.cancelAt} v={fmt(props.cancelAt, l)} />
        <Row k={t.subscriptionId} v={props.stripeSubscriptionId ?? "—"} />
        <Row k={t.clubId} v={props.clubId ?? "—"} />
      </Section>
    </EmailShell>
  );
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Text style={row}>
      <span style={key}>{k} :</span> <span style={val}>{v}</span>
    </Text>
  );
}

export const template = {
  component: SubscriptionAdminNotification,
  to: "hello@clubero.app",
  subject: (data: Record<string, any>) => {
    const t = pick(pickLocale(data.locale));
    const label = t.labels[(data.eventType as EventType) ?? "created"] ?? t.fallback;
    return t.subject(label, data.clubName ?? "Club");
  },
  displayName: "Notification admin abonnement",
  previewData: {
    eventType: "created",
    clubName: "AS Clubero",
    clubId: "00000000-0000-0000-0000-000000000000",
    plan: "monthly",
    status: "trialing",
    customerEmail: "admin@example.com",
    trialEnd: new Date().toISOString(),
    stripeSubscriptionId: "sub_xxx",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.55", margin: "0 0 16px" };
const card = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "12px 16px",
};
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.5" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
