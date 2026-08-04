import * as React from "react";
import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
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
  locale?: string;
}

const T = {
  fr: {
    titleInitial: "Nouveau paiement à régler",
    titleOverdue: "Paiement en retard",
    titleReminder: "Rappel de paiement",
    previewInitial: (item: string) => `Nouveau paiement — ${item}`,
    previewReminder: (item: string) => `Rappel — ${item}`,
    leadInitial: (club: string, item: string, due?: string | null) =>
      `Votre club ${club} a ouvert un nouveau paiement : « ${item} »${due ? `, à régler avant le ${due}` : ""}.`,
    leadOverdue: (item: string, days: number) =>
      `Le paiement pour « ${item} » est en retard de ${days} jour${days > 1 ? "s" : ""}.`,
    leadToday: (item: string) => `Le paiement pour « ${item} » est dû aujourd'hui.`,
    leadSoon: (item: string, days: number) =>
      `Le paiement pour « ${item} » est dû dans ${days} jour${days > 1 ? "s" : ""}.`,
    club: "Club",
    player: "Joueur",
    item: "Objet",
    amount: "Montant",
    remaining: "Restant à payer",
    due: "Échéance",
    cta: "Régler maintenant",
    foot: "Vous pouvez aussi retrouver tous vos paiements à tout moment depuis votre espace Clubero.",
    subjectInitial: (item: string, club: string) => `Nouveau paiement — ${item} (${club})`,
    subjectOverdue: (item: string, club: string) => `Paiement en retard — ${item} (${club})`,
    subjectReminder: (item: string, club: string) => `Rappel — ${item} (${club})`,
    fallbackItem: "Paiement",
    fallbackClub: "Clubero",
  },
  en: {
    titleInitial: "New payment due",
    titleOverdue: "Payment overdue",
    titleReminder: "Payment reminder",
    previewInitial: (item: string) => `New payment — ${item}`,
    previewReminder: (item: string) => `Reminder — ${item}`,
    leadInitial: (club: string, item: string, due?: string | null) =>
      `Your club ${club} has opened a new payment: “${item}”${due ? `, due by ${due}` : ""}.`,
    leadOverdue: (item: string, days: number) =>
      `The payment for “${item}” is ${days} day${days > 1 ? "s" : ""} overdue.`,
    leadToday: (item: string) => `The payment for “${item}” is due today.`,
    leadSoon: (item: string, days: number) =>
      `The payment for “${item}” is due in ${days} day${days > 1 ? "s" : ""}.`,
    club: "Club",
    player: "Player",
    item: "Item",
    amount: "Amount",
    remaining: "Remaining",
    due: "Due date",
    cta: "Pay now",
    foot: "You can also find all your payments anytime in your Clubero account.",
    subjectInitial: (item: string, club: string) => `New payment — ${item} (${club})`,
    subjectOverdue: (item: string, club: string) => `Payment overdue — ${item} (${club})`,
    subjectReminder: (item: string, club: string) => `Reminder — ${item} (${club})`,
    fallbackItem: "Payment",
    fallbackClub: "Clubero",
  },
} as const;

const pick = (l: Locale) => (l === "fr" ? T.fr : T.en);

const PaymentReminderEmail = (p: Props) => {
  const l = pickLocale(p.locale);
  const t = pick(l);
  const overdue = p.offsetDays > 0;
  const isInitial = p.kind === "initial";
  const title = isInitial ? t.titleInitial : overdue ? t.titleOverdue : t.titleReminder;
  const lead = isInitial
    ? t.leadInitial(p.clubName, p.itemTitle, p.dueDateLabel)
    : overdue
      ? t.leadOverdue(p.itemTitle, p.offsetDays)
      : p.offsetDays === 0
        ? t.leadToday(p.itemTitle)
        : t.leadSoon(p.itemTitle, Math.abs(p.offsetDays));

  return (
    <EmailShell
      preview={isInitial ? t.previewInitial(p.itemTitle) : t.previewReminder(p.itemTitle)}
      locale={l}
    >
      <Heading style={h1}>{title}</Heading>
      <Text style={leadStyle}>{lead}</Text>
      <Section style={card}>
        <Row k={t.club} v={p.clubName} />
        {p.playerName && <Row k={t.player} v={p.playerName} />}
        <Row k={t.item} v={p.itemTitle} />
        <Row k={t.amount} v={p.amountLabel} />
        {p.remainingLabel && <Row k={t.remaining} v={p.remainingLabel} />}
        {p.dueDateLabel && <Row k={t.due} v={p.dueDateLabel} />}
      </Section>
      <Section style={{ textAlign: "center", margin: "24px 0" }}>
        <Button href={p.payUrl} style={btn}>
          {t.cta}
        </Button>
      </Section>
      <Text style={muted}>{t.foot}</Text>
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
    const t = pick(pickLocale(d.locale));
    const item = d.itemTitle ?? t.fallbackItem;
    const club = d.clubName ?? t.fallbackClub;
    if (d.kind === "initial") return t.subjectInitial(item, club);
    const overdue = (d.offsetDays ?? 0) > 0;
    return overdue ? t.subjectOverdue(item, club) : t.subjectReminder(item, club);
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
    locale: "fr",
  },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 12px" };
const leadStyle = { fontSize: "14px", color: "#334155", margin: "0 0 18px", lineHeight: "1.55" };
const card = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "14px 18px",
};
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.6" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
const btn = {
  background: "#0f172a",
  color: "#ffffff",
  padding: "12px 22px",
  borderRadius: "8px",
  textDecoration: "none",
  fontWeight: 600,
  fontSize: "14px",
};
const muted = { fontSize: "12px", color: "#64748b", margin: "10px 0 0", lineHeight: "1.5" };
