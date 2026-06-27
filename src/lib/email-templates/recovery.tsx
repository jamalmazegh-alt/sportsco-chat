import * as React from "react";
import { BrandedEmail, pickLocale, type Locale } from "./_layout";

interface RecoveryEmailProps {
  siteName?: string;
  confirmationUrl: string;
  locale?: string;
}

export const RecoveryEmail = ({ confirmationUrl, locale }: RecoveryEmailProps) => {
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

export default RecoveryEmail;

const COPY: Record<
  Locale,
  { preview: string; heading: string; intro: string; cta: string; footer: string; signOff: string }
> = {
  fr: {
    preview: "Réinitialisez votre mot de passe Clubero",
    heading: "Réinitialiser votre mot de passe",
    intro:
      "Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.",
    cta: "Réinitialiser mon mot de passe",
    footer:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail. Votre mot de passe restera inchangé.",
    signOff: "L'équipe Clubero",
  },
  en: {
    preview: "Reset your Clubero password",
    heading: "Reset your password",
    intro:
      "We received a request to reset your password. Click the button below to choose a new one.",
    cta: "Reset my password",
    footer: "If you didn't request this, ignore this email. Your password will stay the same.",
    signOff: "The Clubero team",
  },
  es: {
    preview: "Restablece tu contraseña Clubero",
    heading: "Restablecer tu contraseña",
    intro:
      "Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para elegir una nueva.",
    cta: "Restablecer contraseña",
    footer: "Si no lo solicitaste, ignora este correo. Tu contraseña no cambiará.",
    signOff: "El equipo de Clubero",
  },
  de: {
    preview: "Setzen Sie Ihr Clubero-Passwort zurück",
    heading: "Passwort zurücksetzen",
    intro:
      "Wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Klicken Sie auf die Schaltfläche, um ein neues zu wählen.",
    cta: "Passwort zurücksetzen",
    footer: "Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.",
    signOff: "Das Clubero-Team",
  },
  it: {
    preview: "Reimposta la password Clubero",
    heading: "Reimposta la password",
    intro:
      "Abbiamo ricevuto una richiesta di reimpostazione della password. Fai clic sul pulsante per sceglierne una nuova.",
    cta: "Reimposta password",
    footer: "Se non hai fatto questa richiesta, ignora questa email.",
    signOff: "Il team Clubero",
  },
  nl: {
    preview: "Reset je Clubero-wachtwoord",
    heading: "Reset je wachtwoord",
    intro:
      "We ontvingen een verzoek om je wachtwoord te resetten. Klik op de knop om een nieuw wachtwoord te kiezen.",
    cta: "Wachtwoord resetten",
    footer: "Als je dit niet hebt aangevraagd, kun je deze e-mail negeren.",
    signOff: "Het Clubero-team",
  },
  pt: {
    preview: "Redefina a sua palavra-passe Clubero",
    heading: "Redefinir palavra-passe",
    intro:
      "Recebemos um pedido para redefinir a sua palavra-passe. Clique no botão para escolher uma nova.",
    cta: "Redefinir palavra-passe",
    footer: "Se não fez este pedido, ignore este e-mail.",
    signOff: "A equipa Clubero",
  },
};
