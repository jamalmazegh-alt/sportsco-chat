import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  buyerEmail: string;
  amount?: number | null;
  currency?: string | null;
  sessionId?: string | null;
  paymentIntentId?: string | null;
}

const TournamentPassPurchasedEmail = (props: Props) => {
  const amount =
    typeof props.amount === "number"
      ? (props.amount / 100).toFixed(2) + " " + (props.currency?.toUpperCase() ?? "EUR")
      : "—";
  return (
    <EmailShell preview={`Nouveau Pass Tournoi acheté — ${props.buyerEmail}`} locale={"fr"}>
          <Heading style={h1}>Nouveau Pass Tournoi acheté</Heading>
          <Section style={card}>
            <Text style={row}>
              <span style={key}>Acheteur :</span> <span style={val}>{props.buyerEmail}</span>
            </Text>
            <Text style={row}>
              <span style={key}>Montant :</span> <span style={val}>{amount}</span>
            </Text>
            {props.sessionId && (
              <Text style={row}>
                <span style={key}>Session Stripe :</span> <span style={val}>{props.sessionId}</span>
              </Text>
            )}
            {props.paymentIntentId && (
              <Text style={row}>
                <span style={key}>PaymentIntent :</span> <span style={val}>{props.paymentIntentId}</span>
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
    `[Clubero] Nouveau Pass Tournoi — ${data.buyerEmail ?? "inconnu"}`,
  displayName: "Pass Tournoi acheté",
  previewData: {
    buyerEmail: "jane@example.com",
    amount: 4000,
    currency: "eur",
    sessionId: "cs_test_123",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px" };
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.5" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
