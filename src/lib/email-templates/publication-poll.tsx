import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface PollOption {
  id: string;
  label: string;
  url: string;
}

interface Props {
  question: string;
  description?: string | null;
  options: PollOption[];
  resultsUrl: string;
  clubName?: string | null;
  locale?: Locale;
}

const T: Record<
  Locale,
  {
    preview: (q: string, c: string) => string;
    hello: string;
    intro: (c: string) => string;
    pickHint: string;
    viewResults: string;
    footer: string;
  }
> = {
  fr: {
    preview: (q, c) => `${c} — ${q}`,
    hello: "Bonjour,",
    intro: (c) => `${c} vous invite à répondre à ce sondage.`,
    pickHint: "Cliquez sur votre choix ci-dessous — un seul vote sera enregistré.",
    viewResults: "Voir les résultats",
    footer: "Vous recevez cet e-mail car ce sondage vous concerne.",
  },
  en: {
    preview: (q, c) => `${c} — ${q}`,
    hello: "Hi,",
    intro: (c) => `${c} would like your answer to this poll.`,
    pickHint: "Tap your choice below — only one vote will be recorded.",
    viewResults: "View results",
    footer: "You receive this email because this poll concerns you.",
  },
  de: {
    preview: (q, c) => `${c} — ${q}`,
    hello: "Hallo,",
    intro: (c) => `${c} bittet um deine Antwort auf diese Umfrage.`,
    pickHint: "Tippe unten auf deine Wahl — nur eine Stimme wird gezählt.",
    viewResults: "Ergebnisse ansehen",
    footer: "Du erhältst diese E-Mail, weil diese Umfrage dich betrifft.",
  },
  es: {
    preview: (q, c) => `${c} — ${q}`,
    hello: "Hola,",
    intro: (c) => `${c} te invita a responder esta encuesta.`,
    pickHint: "Pulsa tu opción abajo — solo se registrará un voto.",
    viewResults: "Ver resultados",
    footer: "Recibes este correo porque esta encuesta te concierne.",
  },
  it: {
    preview: (q, c) => `${c} — ${q}`,
    hello: "Ciao,",
    intro: (c) => `${c} ti invita a rispondere a questo sondaggio.`,
    pickHint: "Tocca la tua scelta qui sotto — sarà registrato un solo voto.",
    viewResults: "Vedi i risultati",
    footer: "Ricevi questa email perché questo sondaggio ti riguarda.",
  },
  nl: {
    preview: (q, c) => `${c} — ${q}`,
    hello: "Hallo,",
    intro: (c) => `${c} vraagt je antwoord op deze poll.`,
    pickHint: "Tik hieronder op je keuze — er wordt slechts één stem geregistreerd.",
    viewResults: "Bekijk resultaten",
    footer: "Je ontvangt deze e-mail omdat deze poll jou betreft.",
  },
  pt: {
    preview: (q, c) => `${c} — ${q}`,
    hello: "Olá,",
    intro: (c) => `${c} pede a tua resposta a esta sondagem.`,
    pickHint: "Toca na tua opção abaixo — apenas um voto será registado.",
    viewResults: "Ver resultados",
    footer: "Recebes este email porque esta sondagem diz-te respeito.",
  },
};

function resolve(locale?: Locale) {
  return (locale && T[locale]) || T.fr;
}

const Email = ({ question, description, options, resultsUrl, clubName, locale = "fr" }: Props) => {
  const t = resolve(locale);
  const c = clubName?.trim() || "Clubero";
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{t.preview(question, c)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{c}</Heading>
          <Text style={text}>{t.hello}</Text>
          <Text style={text}>{t.intro(c)}</Text>
          <Section style={card}>
            <Text style={question_}>{question}</Text>
            {description ? <Text style={desc}>{description}</Text> : null}
          </Section>
          <Text style={hint}>{t.pickHint}</Text>
          <Section style={{ margin: "16px 0" }}>
            {options.map((opt) => (
              <div key={opt.id} style={{ margin: "0 0 10px 0" }}>
                <Button href={opt.url} style={btn}>
                  {opt.label}
                </Button>
              </div>
            ))}
          </Section>
          <Section style={{ textAlign: "center", margin: "20px 0 8px 0" }}>
            <Link href={resultsUrl} style={link}>
              {t.viewResults}
            </Link>
          </Section>
          <Text style={footer}>{t.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const t = resolve(data.locale as Locale);
    const q = (data.question as string | null | undefined)?.trim() || "";
    const c = (data.clubName as string | null | undefined)?.trim() || "Clubero";
    return t.preview(q, c);
  },
  displayName: "Publication — sondage",
  previewData: {
    question: "Disponible samedi à 9h ?",
    description: "Merci de répondre avant vendredi soir.",
    options: [
      {
        id: "a",
        label: "Oui, je serai là",
        url: "https://www.clubero.app/publications/demo?vote=a",
      },
      {
        id: "b",
        label: "Non, indisponible",
        url: "https://www.clubero.app/publications/demo?vote=b",
      },
    ],
    resultsUrl: "https://www.clubero.app/publications/demo",
    clubName: "ESAP",
    locale: "fr",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const h1 = { fontSize: "20px", color: "#0f172a", margin: "0 0 12px 0" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "22px" };
const question_ = { fontSize: "16px", color: "#0f172a", fontWeight: 600, margin: "0 0 8px 0" };
const desc = { fontSize: "14px", color: "#475569", margin: "0", lineHeight: "20px" };
const hint = { fontSize: "13px", color: "#64748b", margin: "16px 0 8px 0" };
const card = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};
const btn = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "6px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 600,
  display: "inline-block",
  width: "100%",
  textAlign: "center" as const,
  boxSizing: "border-box" as const,
};
const link = { color: "#0f172a", fontSize: "13px", textDecoration: "underline" };
const footer = { fontSize: "12px", color: "#94a3b8", marginTop: "24px" };
