import * as React from "react";
import { BrandedEmail, pickLocale, type Locale } from "./_layout";

interface MagicLinkEmailProps {
  siteName?: string;
  confirmationUrl: string;
  locale?: string;
}

export const MagicLinkEmail = ({ confirmationUrl, locale }: MagicLinkEmailProps) => {
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

export default MagicLinkEmail;

const COPY: Record<
  Locale,
  { preview: string; heading: string; intro: string; cta: string; footer: string; signOff: string }
> = {
  fr: {
    preview: "Votre lien de connexion Clubero",
    heading: "Votre lien de connexion",
    intro:
      "Cliquez sur le bouton ci-dessous pour vous connecter à Clubero. Ce lien expire rapidement.",
    cta: "Me connecter",
    footer: "Si vous n'avez pas demandé ce lien, ignorez cet e-mail.",
    signOff: "L'équipe Clubero",
  },
  en: {
    preview: "Your Clubero login link",
    heading: "Your login link",
    intro: "Click the button below to log in to Clubero. This link expires shortly.",
    cta: "Log in",
    footer: "If you didn't request this link, ignore this email.",
    signOff: "The Clubero team",
  },
  es: {
    preview: "Tu enlace de acceso Clubero",
    heading: "Tu enlace de acceso",
    intro: "Haz clic en el botón para iniciar sesión en Clubero. Este enlace caduca pronto.",
    cta: "Iniciar sesión",
    footer: "Si no lo solicitaste, ignora este correo.",
    signOff: "El equipo de Clubero",
  },
  de: {
    preview: "Ihr Clubero-Anmeldelink",
    heading: "Ihr Anmeldelink",
    intro:
      "Klicken Sie auf die Schaltfläche, um sich bei Clubero anzumelden. Dieser Link läuft bald ab.",
    cta: "Anmelden",
    footer: "Wenn Sie diesen Link nicht angefordert haben, ignorieren Sie diese E-Mail.",
    signOff: "Das Clubero-Team",
  },
  it: {
    preview: "Il tuo link di accesso Clubero",
    heading: "Il tuo link di accesso",
    intro: "Fai clic sul pulsante per accedere a Clubero. Il link scade a breve.",
    cta: "Accedi",
    footer: "Se non hai richiesto questo link, ignora questa email.",
    signOff: "Il team Clubero",
  },
  nl: {
    preview: "Je Clubero-inloglink",
    heading: "Je inloglink",
    intro: "Klik op de knop om in te loggen bij Clubero. Deze link verloopt snel.",
    cta: "Inloggen",
    footer: "Als je deze link niet hebt aangevraagd, negeer deze e-mail.",
    signOff: "Het Clubero-team",
  },
  pt: {
    preview: "O seu link de acesso Clubero",
    heading: "O seu link de acesso",
    intro: "Clique no botão para entrar no Clubero. Este link expira em breve.",
    cta: "Entrar",
    footer: "Se não solicitou este link, ignore este e-mail.",
    signOff: "A equipa Clubero",
  },
};
