import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

type Locale = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

interface Props {
  authorName?: string | null;
  clubName?: string | null;
  body: string;
  wallUrl: string;
  locale?: Locale;
}

const T: Record<
  Locale,
  {
    preview: (author: string, club: string) => string;
    hello: (n?: string | null) => string;
    intro: (author: string, club: string) => string;
    cta: string;
    footer: string;
  }
> = {
  fr: {
    preview: (a, c) => `Nouveau message de ${c} — ${a}`,
    hello: () => "Bonjour,",
    intro: (a, c) => `${a} a publié un message sur le mur de ${c}.`,
    cta: "Voir sur le mur",
    footer: "Tu reçois cet email parce que tu es membre du club et concerné par ce message.",
  },
  en: {
    preview: (a, c) => `New message from ${c} — ${a}`,
    hello: () => "Hi,",
    intro: (a, c) => `${a} posted a message on the ${c} wall.`,
    cta: "View on the wall",
    footer: "You receive this email because you are a club member concerned by this message.",
  },
  de: {
    preview: (a, c) => `Neue Nachricht von ${c} — ${a}`,
    hello: () => "Hallo,",
    intro: (a, c) => `${a} hat eine Nachricht an der ${c}-Pinnwand veröffentlicht.`,
    cta: "Zur Pinnwand",
    footer:
      "Du erhältst diese E-Mail, weil du Mitglied des Vereins und von dieser Nachricht betroffen bist.",
  },
  es: {
    preview: (a, c) => `Nuevo mensaje de ${c} — ${a}`,
    hello: () => "Hola,",
    intro: (a, c) => `${a} ha publicado un mensaje en el muro de ${c}.`,
    cta: "Ver en el muro",
    footer: "Recibes este correo porque eres miembro del club y este mensaje te concierne.",
  },
  it: {
    preview: (a, c) => `Nuovo messaggio da ${c} — ${a}`,
    hello: () => "Ciao,",
    intro: (a, c) => `${a} ha pubblicato un messaggio sulla bacheca di ${c}.`,
    cta: "Vedi sulla bacheca",
    footer: "Ricevi questa email perché sei membro del club e interessato da questo messaggio.",
  },
  nl: {
    preview: (a, c) => `Nieuw bericht van ${c} — ${a}`,
    hello: () => "Hallo,",
    intro: (a, c) => `${a} heeft een bericht op het prikbord van ${c} geplaatst.`,
    cta: "Bekijk op het prikbord",
    footer: "Je ontvangt deze e-mail omdat je lid bent van de club en dit bericht jou betreft.",
  },
  pt: {
    preview: (a, c) => `Nova mensagem de ${c} — ${a}`,
    hello: () => "Olá,",
    intro: (a, c) => `${a} publicou uma mensagem no mural de ${c}.`,
    cta: "Ver no mural",
    footer: "Recebes este email porque és membro do clube e esta mensagem diz-te respeito.",
  },
};

function resolve(locale?: Locale): typeof T.fr {
  return (locale && T[locale]) || T.fr;
}

const Email = ({ authorName, clubName, body, wallUrl, locale = "fr" }: Props) => {
  const t = resolve(locale);
  const a = authorName?.trim() || "—";
  const c = clubName?.trim() || "Clubero";
  const bodyLines = (body ?? "").split("\n");
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{t.preview(a, c)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{c}</Heading>
          <Text style={text}>{t.hello()}</Text>
          <Text style={text}>{t.intro(a, c)}</Text>
          <Section style={card}>
            {bodyLines.map((line, i) => (
              <Text key={i} style={{ ...text, margin: line ? "0 0 6px 0" : "0 0 12px 0" }}>
                {line || "\u00A0"}
              </Text>
            ))}
          </Section>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button href={wallUrl} style={btn}>
              {t.cta}
            </Button>
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
    const a = (data.authorName as string | null | undefined)?.trim() || "—";
    const c = (data.clubName as string | null | undefined)?.trim() || "Clubero";
    return t.preview(a, c);
  },
  displayName: "Wall — message",
  previewData: {
    authorName: "Coach Alex",
    clubName: "ESAP",
    body: "Rendez-vous samedi à 9h au gymnase.\nMerci de confirmer votre présence.",
    wallUrl: "https://clubero.app/wall",
    locale: "fr",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px", maxWidth: "560px" };
const h1 = { fontSize: "20px", color: "#0f172a", margin: "0 0 12px 0" };
const text = { fontSize: "14px", color: "#334155", lineHeight: "22px" };
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
};
const footer = { fontSize: "12px", color: "#94a3b8", marginTop: "24px" };
