import * as React from "react";
import { BrandedEmail, pickLocale, type Locale } from "./_layout";

interface SignupEmailProps {
  siteName: string;
  siteUrl?: string;
  recipient?: string;
  confirmationUrl: string;
  locale?: string;
}

export const SignupEmail = ({ confirmationUrl, locale }: SignupEmailProps) => {
  const l: Locale = pickLocale(locale);
  const t = COPY[l];
  return (
    <BrandedEmail
      locale={l}
      preview={t.preview}
      heading={t.heading}
      intro={t.intro}
      ctaLabel={t.cta}
      ctaUrl={confirmationUrl}
      footer={t.footer}
      signOff={t.signOff}
    />
  );
};

export default SignupEmail;

const COPY: Record<
  Locale,
  { preview: string; heading: string; intro: string; cta: string; footer: string; signOff: string }
> = {
  fr: {
    preview: "Confirmez votre adresse e-mail Clubero",
    heading: "Bienvenue sur Clubero",
    intro: "Merci de vous être inscrit. Confirmez votre adresse e-mail pour activer votre compte.",
    cta: "Confirmer mon e-mail",
    footer: "Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet e-mail.",
    signOff: "L'équipe Clubero",
  },
  en: {
    preview: "Confirm your Clubero email",
    heading: "Welcome to Clubero",
    intro: "Thanks for signing up. Confirm your email address to activate your account.",
    cta: "Confirm my email",
    footer: "If you didn't sign up, you can safely ignore this email.",
    signOff: "The Clubero team",
  },
  es: {
    preview: "Confirma tu correo de Clubero",
    heading: "Bienvenido a Clubero",
    intro: "Gracias por registrarte. Confirma tu correo para activar tu cuenta.",
    cta: "Confirmar mi correo",
    footer: "Si no te registraste, ignora este correo.",
    signOff: "El equipo de Clubero",
  },
  de: {
    preview: "Bestätigen Sie Ihre Clubero-E-Mail",
    heading: "Willkommen bei Clubero",
    intro:
      "Danke für Ihre Anmeldung. Bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.",
    cta: "E-Mail bestätigen",
    footer: "Wenn Sie sich nicht registriert haben, ignorieren Sie diese E-Mail.",
    signOff: "Das Clubero-Team",
  },
  it: {
    preview: "Conferma la tua email Clubero",
    heading: "Benvenuto su Clubero",
    intro: "Grazie per esserti registrato. Conferma la tua email per attivare il tuo account.",
    cta: "Conferma email",
    footer: "Se non ti sei registrato, ignora questa email.",
    signOff: "Il team Clubero",
  },
  nl: {
    preview: "Bevestig je Clubero e-mail",
    heading: "Welkom bij Clubero",
    intro: "Bedankt voor je registratie. Bevestig je e-mailadres om je account te activeren.",
    cta: "E-mail bevestigen",
    footer: "Als je je niet hebt aangemeld, kun je deze e-mail negeren.",
    signOff: "Het Clubero-team",
  },
  pt: {
    preview: "Confirme o seu e-mail Clubero",
    heading: "Bem-vindo ao Clubero",
    intro: "Obrigado por se registar. Confirme o seu e-mail para ativar a sua conta.",
    cta: "Confirmar e-mail",
    footer: "Se não se registou, ignore este e-mail.",
    signOff: "A equipa Clubero",
  },
};
