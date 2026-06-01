import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  clubName: string;
  payerName?: string | null;
  playerName?: string | null;
  itemTitle: string;
  amountLabel: string;
  methodLabel: string;
  receiptNumber: string;
  paidAt?: string | null;
  downloadUrl?: string | null;
}

const PaymentReceiptEmail = (p: Props) => (
  <EmailShell preview={`Reçu de paiement — ${p.itemTitle}`} locale="fr">
    <Heading style={h1}>Merci pour votre paiement</Heading>
    <Text style={lead}>
      {p.clubName} confirme la bonne réception de votre paiement.
    </Text>
    <Section style={card}>
      <Row k="Objet" v={p.itemTitle} />
      {p.playerName && <Row k="Joueur" v={p.playerName} />}
      <Row k="Montant" v={p.amountLabel} />
      <Row k="Mode" v={p.methodLabel} />
      {p.paidAt && <Row k="Date" v={p.paidAt} />}
      <Row k="N° de reçu" v={p.receiptNumber} />
    </Section>
    {p.downloadUrl && (
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={p.downloadUrl} style={btn}>
          Télécharger le reçu (PDF)
        </Button>
        <Text style={muted}>Le lien expire après quelques minutes.</Text>
      </Section>
    )}
    <Text style={muted}>
      Vous pouvez retrouver tous vos paiements et reçus à tout moment depuis votre
      espace Clubero.
    </Text>
  </EmailShell>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <Text style={row}>
    <span style={key}>{k} :</span> <span style={val}>{v}</span>
  </Text>
);

export const template = {
  component: PaymentReceiptEmail,
  subject: (d: Record<string, any>) =>
    `Reçu — ${d.itemTitle ?? "Paiement"} (${d.clubName ?? "Clubero"})`,
  displayName: "Reçu de paiement",
  previewData: {
    clubName: "AS Démo",
    payerName: "Jean Dupont",
    playerName: "Léa Dupont",
    itemTitle: "Licence saison 2026/2027",
    amountLabel: "120,00 EUR",
    methodLabel: "Carte (Stripe)",
    receiptNumber: "000042",
    paidAt: "1 juin 2026",
    downloadUrl: "https://example.com/receipt.pdf",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 12px" };
const lead = { fontSize: "14px", color: "#334155", margin: "0 0 18px", lineHeight: "1.55" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px" };
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.6" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
const btn = { background: "#0f172a", color: "#ffffff", padding: "12px 22px", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px" };
const muted = { fontSize: "12px", color: "#64748b", margin: "10px 0 0", lineHeight: "1.5" };
