import * as React from "react";
import { Heading, Section, Text } from "@react-email/components";
import { EmailShell, pickLocale, type Locale } from "./_layout";
import type { TemplateEntry } from "./registry";

interface Props {
  features?: string[];
  locale?: string;
}

const COPY: Record<
  Locale,
  { title: string; intro: string; soon: string; thanks: string; subject: string; features: string }
> = {
  fr: {
    title: "Vous êtes sur la liste 🎉",
    intro: "Merci pour votre intérêt pour les prochaines fonctionnalités Clubero.",
    soon: "Nous vous écrirons dès qu'elles ouvriront en bêta.",
    thanks: "À très vite,\nL'équipe Clubero",
    features: "Fonctionnalités sélectionnées :",
    subject: "Vous êtes sur la liste d'attente Clubero",
  },
  en: {
    title: "You're on the list 🎉",
    intro: "Thanks for your interest in upcoming Clubero features.",
    soon: "We'll write back as soon as they open in beta.",
    thanks: "Talk soon,\nThe Clubero team",
    features: "Selected features:",
    subject: "You're on the Clubero waitlist",
  },
  es: {
    title: "Estás en la lista 🎉",
    intro: "Gracias por tu interés en las próximas funciones de Clubero.",
    soon: "Te escribiremos en cuanto se abran en beta.",
    thanks: "Hasta pronto,\nEl equipo Clubero",
    features: "Funciones seleccionadas:",
    subject: "Estás en la lista de espera Clubero",
  },
  de: {
    title: "Sie sind auf der Liste 🎉",
    intro: "Danke für Ihr Interesse an den kommenden Clubero-Funktionen.",
    soon: "Wir melden uns, sobald die Beta startet.",
    thanks: "Bis bald,\nDas Clubero-Team",
    features: "Ausgewählte Funktionen:",
    subject: "Sie stehen auf der Clubero-Warteliste",
  },
  it: {
    title: "Sei in lista 🎉",
    intro: "Grazie per il tuo interesse nelle prossime funzionalità Clubero.",
    soon: "Ti scriveremo appena saranno disponibili in beta.",
    thanks: "A presto,\nIl team Clubero",
    features: "Funzionalità selezionate:",
    subject: "Sei nella lista d'attesa Clubero",
  },
  nl: {
    title: "U staat op de lijst 🎉",
    intro: "Bedankt voor uw interesse in de komende Clubero-functies.",
    soon: "We laten het weten zodra de beta opent.",
    thanks: "Tot snel,\nHet Clubero-team",
    features: "Geselecteerde functies:",
    subject: "U staat op de Clubero-wachtlijst",
  },
  pt: {
    title: "Está na lista 🎉",
    intro: "Obrigado pelo seu interesse nas próximas funcionalidades Clubero.",
    soon: "Avisamos assim que abrirem em beta.",
    thanks: "Até breve,\nA equipa Clubero",
    features: "Funcionalidades selecionadas:",
    subject: "Está na lista de espera Clubero",
  },
};

const Email = ({ features, locale }: Props) => {
  const l = pickLocale(locale);
  const c = COPY[l];
  return (
    <EmailShell preview={c.title} locale={l}>
      <Heading style={h1}>{c.title}</Heading>
      <Text style={text}>{c.intro}</Text>
      <Text style={text}>{c.soon}</Text>
      {features && features.length > 0 && (
        <Section style={card}>
          <Text style={cardLabel}>{c.features}</Text>
          <Text style={cardText}>{features.join(" · ")}</Text>
        </Section>
      )}
      <Text style={text}>
        {c.thanks.split("\n").map((s, i) => (
          <React.Fragment key={i}>
            {s}
            <br />
          </React.Fragment>
        ))}
      </Text>
    </EmailShell>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => COPY[pickLocale(data.locale)].subject,
  displayName: "Confirmation liste d'attente V2 (utilisateur)",
  previewData: { features: ["player_network", "payments"], locale: "fr" },
} satisfies TemplateEntry;

const h1 = { fontSize: "20px", fontWeight: "bold" as const, color: "#0f172a", margin: "0 0 16px" };
const text = {
  fontSize: "14px",
  color: "#334155",
  lineHeight: "1.6",
  margin: "0 0 14px",
  whiteSpace: "pre-line" as const,
};
const card = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "16px 0",
};
const cardLabel = {
  fontSize: "12px",
  color: "#64748b",
  margin: "0 0 6px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};
const cardText = { fontSize: "13px", color: "#0f172a", lineHeight: "1.55", margin: 0 };
