import * as React from "react";
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from "@react-email/components";
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
}

const LABELS: Record<EventType, string> = {
  created: "Nouvel abonnement",
  trial_started: "Début de période d'essai",
  canceled: "Abonnement annulé",
  cancellation_scheduled: "Résiliation programmée",
  reactivated: "Abonnement réactivé",
  payment_failed: "Échec de paiement",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("fr-FR"); } catch { return d; }
}

const SubscriptionAdminNotification = (props: Props) => {
  const label = LABELS[props.eventType] ?? props.eventType;
  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>{label} — {props.clubName ?? "Club"}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{label}</Heading>
          <Text style={text}>
            Club : <strong>{props.clubName ?? "—"}</strong>
          </Text>
          <Section style={card}>
            <Row k="Plan" v={props.plan ?? "—"} />
            <Row k="Statut Stripe" v={props.status ?? "—"} />
            <Row k="Email client" v={props.customerEmail ?? "—"} />
            <Row k="Fin essai" v={fmt(props.trialEnd)} />
            <Row k="Fin période" v={fmt(props.currentPeriodEnd)} />
            <Row k="Annulation prévue" v={fmt(props.cancelAt)} />
            <Row k="Subscription ID" v={props.stripeSubscriptionId ?? "—"} />
            <Row k="Club ID" v={props.clubId ?? "—"} />
          </Section>
        </Container>
      </Body>
    </Html>
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
    const label = LABELS[(data.eventType as EventType) ?? "created"] ?? "Mise à jour abonnement";
    return `[Clubero] ${label} — ${data.clubName ?? "Club"}`;
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
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.55", margin: "0 0 16px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px" };
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.5" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
