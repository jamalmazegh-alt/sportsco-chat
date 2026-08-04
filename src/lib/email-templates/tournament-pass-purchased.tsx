import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  buyerEmail: string;
  amount?: number | null;
  currency?: string | null;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  locale?: string;
}

const T = {
  fr: {
    preview: (email: string) => `Nouveau Pass Tournoi acheté — ${email}`,
    title: "Nouveau Pass Tournoi acheté",
    buyer: "Acheteur",
    amount: "Montant",
    session: "Session Stripe",
    paymentIntent: "PaymentIntent",
    subject: (email: string) => `[Clubero] Nouveau Pass Tournoi — ${email || "inconnu"}`,
  },
  en: {
    preview: (email: string) => `New Tournament Pass purchased — ${email}`,
    title: "New Tournament Pass purchased",
    buyer: "Buyer",
    amount: "Amount",
    session: "Stripe session",
    paymentIntent: "PaymentIntent",
    subject: (email: string) => `[Clubero] New Tournament Pass — ${email || "unknown"}`,
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const TournamentPassPurchasedEmail = (props: Props) => {
  const l = pickLocale(props.locale);
  const t = pick(l);
  const amount =
    typeof props.amount === "number"
      ? (props.amount / 100).toFixed(2) + " " + (props.currency?.toUpperCase() ?? "EUR")
      : "—";
  return (
    <EmailShell preview={t.preview(props.buyerEmail)} locale={l}>
      <Heading style={h1}>{t.title}</Heading>
      <Section style={card}>
        <Text style={row}>
          <span style={key}>{t.buyer} :</span> <span style={val}>{props.buyerEmail}</span>
        </Text>
        <Text style={row}>
          <span style={key}>{t.amount} :</span> <span style={val}>{amount}</span>
        </Text>
        {props.sessionId && (
          <Text style={row}>
            <span style={key}>{t.session} :</span> <span style={val}>{props.sessionId}</span>
          </Text>
        )}
        {props.paymentIntentId && (
          <Text style={row}>
            <span style={key}>{t.paymentIntent} :</span>{" "}
            <span style={val}>{props.paymentIntentId}</span>
          </Text>
        )}
      </Section>
    </EmailShell>
  );
};

export const template = {
  component: TournamentPassPurchasedEmail,
  to: "hello@clubero.app",
  subject: (data: Record<string, any>) =>
    pick(pickLocale(data.locale)).subject(data.buyerEmail ?? ""),
  displayName: "Pass Tournoi acheté",
  previewData: {
    buyerEmail: "jane@example.com",
    amount: 4000,
    currency: "eur",
    sessionId: "cs_test_123",
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const card = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "12px 16px",
};
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.5" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
