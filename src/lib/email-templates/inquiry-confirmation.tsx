import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  kind?: "contact" | "demo";
  name?: string;
}

const InquiryConfirmationEmail = ({ kind = "contact", name }: Props) => {
  const isDemo = kind === "demo";
  const title = isDemo
    ? "Merci pour votre demande de démo"
    : "Merci de nous avoir contactés";
  return (
    <EmailShell preview={`${title} — Clubero`} locale={"fr"}>
          <Heading style={h1}>
            {name ? `Bonjour ${name},` : "Bonjour,"}
          </Heading>
          <Text style={text}>{title}.</Text>
          <Text style={text}>
            Nous avons bien reçu votre {isDemo ? "demande de démo" : "message"} et
            nous reviendrons vers vous sous <strong>48 heures ouvrées</strong>.
          </Text>
          <Section style={card}>
            <Text style={cardText}>
              En attendant, n'hésitez pas à consulter notre site
              {" "}
              <a href="https://www.clubero.app" style={link}>www.clubero.app</a>.
            </Text>
          </Section>
          </EmailShell>
  );
};

export const template = {
  component: InquiryConfirmationEmail,
  subject: (data: Record<string, any>) =>
    data.kind === "demo"
      ? "Votre demande de démo Clubero"
      : "Nous avons bien reçu votre message — Clubero",
  displayName: "Confirmation contact / démo (utilisateur)",
  previewData: { kind: "contact", name: "Jane" },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 14px" };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", margin: "16px 0" };
const cardText = { fontSize: "13px", color: "#334155", lineHeight: "1.55", margin: 0 };
const link = { color: "#2563eb", textDecoration: "none" };
