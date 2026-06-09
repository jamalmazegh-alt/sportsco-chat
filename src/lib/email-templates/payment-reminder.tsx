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
  remainingLabel?: string | null;
  dueDateLabel?: string | null;
  offsetDays: number; // negative = before due date, positive = after
  payUrl: string;
  /** "initial" = première notification à l'ouverture du poste ; "reminder" (défaut) = relance. */
  kind?: "initial" | "reminder";
}

const PaymentReminderEmail = (p: Props) => {
  const overdue = p.offsetDays > 0;
  const isInitial = p.kind === "initial";
  const title = isInitial
    ? "Nouveau paiement à régler"
    : overdue
      ? "Paiement en retard"
      : "Rappel de paiement";
  const lead = isInitial
    ? `Votre club ${p.clubName} a ouvert un nouveau paiement : « ${p.itemTitle} »${p.dueDateLabel ? `, à régler avant le ${p.dueDateLabel}` : ""}.`
    : overdue
      ? `Le paiement pour « ${p.itemTitle} » est en retard de ${p.offsetDays} jour${p.offsetDays > 1 ? "s" : ""}.`
      : p.offsetDays === 0
        ? `Le paiement pour « ${p.itemTitle} » est dû aujourd'hui.`
        : `Le paiement pour « ${p.itemTitle} » est dû dans ${Math.abs(p.offsetDays)} jour${Math.abs(p.offsetDays) > 1 ? "s" : ""}.`;

  return (
    <EmailShell preview={`${isInitial ? "Nouveau paiement" : "Rappel"} — ${p.itemTitle}`} locale="fr">
      <Heading style={h1}>{title}</Heading>
      <Text style={leadStyle}>{lead}</Text>
      <Section style={card}>
        <Row k="Club" v={p.clubName} />
        {p.playerName && <Row k="Joueur" v={p.playerName} />}
        <Row k="Objet" v={p.itemTitle} />
        <Row k="Montant" v={p.amountLabel} />
        {p.remainingLabel && <Row k="Restant à payer" v={p.remainingLabel} />}
        {p.dueDateLabel && <Row k="Échéance" v={p.dueDateLabel} />}
      </Section>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={p.payUrl} style={btn}>
          Régler maintenant
        </Button>
      </Section>
      <Text style={muted}>
        Vous pouvez aussi retrouver tous vos paiements à tout moment depuis votre
        espace Clubero.
      </Text>
    </EmailShell>
  );
};

const Row = ({ k, v }: { k: string; v: string }) => (
  <Text style={row}>
    <span style={key}>{k} :</span> <span style={val}>{v}</span>
  </Text>
);

export const template = {
  component: PaymentReminderEmail,
  subject: (d: Record<string, any>) => {
    const overdue = (d.offsetDays ?? 0) > 0;
    return `${overdue ? "Paiement en retard" : "Rappel"} — ${d.itemTitle ?? "Paiement"} (${d.clubName ?? "Clubero"})`;
  },
  displayName: "Rappel de paiement",
  previewData: {
    clubName: "AS Démo",
    playerName: "Léa Dupont",
    itemTitle: "Licence saison 2026/2027",
    amountLabel: "120,00 EUR",
    remainingLabel: "120,00 EUR",
    dueDateLabel: "8 juin 2026",
    offsetDays: -7,
    payUrl: "https://www.clubero.app/payments",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 12px" };
const leadStyle = { fontSize: "14px", color: "#334155", margin: "0 0 18px", lineHeight: "1.55" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 18px" };
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.6" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
const btn = { background: "#0f172a", color: "#ffffff", padding: "12px 22px", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px" };
const muted = { fontSize: "12px", color: "#64748b", margin: "10px 0 0", lineHeight: "1.5" };
