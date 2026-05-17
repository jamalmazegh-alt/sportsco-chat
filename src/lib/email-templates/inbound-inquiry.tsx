import * as React from "react";
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

type InquiryKind = "contact" | "demo";

interface Props {
  kind: InquiryKind;
  firstName?: string;
  lastName?: string;
  name?: string;
  email: string;
  phone?: string;
  club?: string;
  role?: string;
  teams?: string;
  message?: string;
  notes?: string;
}

const LABELS: Record<InquiryKind, string> = {
  contact: "Nouveau message de contact",
  demo: "Nouvelle demande de démo",
};

const InboundInquiryEmail = (props: Props) => {
  const kind: InquiryKind = (props.kind as InquiryKind) ?? "contact";
  const label = LABELS[kind];
  const isDemo = kind === "demo";
  return (
    <Html lang="fr" dir="ltr">
      <Head />
      <Preview>{label} — {props.firstName || props.name || props.email}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{label}</Heading>
          <Section style={card}>
            {props.firstName && <Row k="Prénom" v={props.firstName} />}
            {(props.lastName || props.name) && (
              <Row k="Nom" v={props.lastName || props.name || "—"} />
            )}
            <Row k="E-mail" v={props.email || "—"} />
            {props.phone && <Row k="Téléphone" v={props.phone} />}
            {props.role && <Row k="Rôle" v={props.role} />}
            {isDemo && <Row k="Club" v={props.club || "—"} />}
            {isDemo && <Row k="Équipes" v={props.teams || "—"} />}
          </Section>
          {(props.message || props.notes) && (
            <>
              <Heading as="h2" style={h2}>
                {isDemo ? "Notes" : "Message"}
              </Heading>
              <Text style={msg}>{props.message || props.notes}</Text>
            </>
          )}
          <Text style={footer}>
            Répondez directement à cet e-mail pour contacter {props.name || "le visiteur"}.
          </Text>
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
  component: InboundInquiryEmail,
  to: "hello@clubero.app",
  subject: (data: Record<string, any>) => {
    const kind: InquiryKind = (data.kind as InquiryKind) ?? "contact";
    const label = LABELS[kind] ?? "Nouveau message";
    const who = data.club || data.name || data.email || "site vitrine";
    return `[Clubero] ${label} — ${who}`;
  },
  displayName: "Demande entrante (contact / démo)",
  previewData: {
    kind: "demo",
    name: "Jane Coach",
    email: "jane@asriverside.fr",
    club: "AS Riverside",
    role: "Coach U15",
    teams: "6",
    notes: "On utilise WhatsApp + Excel, on cherche mieux.",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const h2 = { fontSize: "14px", fontWeight: "bold" as const, color: "#0f172a", margin: "20px 0 8px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px" };
const row = { fontSize: "13px", color: "#0f172a", margin: "4px 0", lineHeight: "1.5" };
const key = { color: "#64748b", marginRight: "6px" };
const val = { fontWeight: "bold" as const };
const msg = { fontSize: "14px", color: "#334155", lineHeight: "1.55", whiteSpace: "pre-wrap" as const, margin: "0" };
const footer = { fontSize: "12px", color: "#94a3b8", margin: "24px 0 0" };
