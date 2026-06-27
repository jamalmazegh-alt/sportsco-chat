import * as React from "react";
import { BrandedEmail, pickLocale, type Locale } from "./_layout";

interface InviteEmailProps {
  siteName?: string;
  siteUrl?: string;
  confirmationUrl: string;
  locale?: string;
}

export const InviteEmail = ({ confirmationUrl, locale }: InviteEmailProps) => {
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

export default InviteEmail;

const COPY: Record<
  Locale,
  { preview: string; heading: string; intro: string; cta: string; footer: string; signOff: string }
> = {
  fr: {
    preview: "Vous êtes invité sur Clubero",
    heading: "Vous êtes invité",
    intro:
      "Vous avez été invité à rejoindre Clubero. Cliquez ci-dessous pour accepter et créer votre compte.",
    cta: "Accepter l'invitation",
    footer: "Si vous n'attendiez pas cette invitation, ignorez cet e-mail.",
    signOff: "L'équipe Clubero",
  },
  en: {
    preview: "You're invited to Clubero",
    heading: "You're invited",
    intro: "You've been invited to join Clubero. Click below to accept and create your account.",
    cta: "Accept invitation",
    footer: "If you weren't expecting this, ignore this email.",
    signOff: "The Clubero team",
  },
  es: {
    preview: "Te invitan a Clubero",
    heading: "Estás invitado",
    intro: "Te han invitado a unirte a Clubero. Haz clic para aceptar y crear tu cuenta.",
    cta: "Aceptar invitación",
    footer: "Si no esperabas esta invitación, ignora este correo.",
    signOff: "El equipo de Clubero",
  },
  de: {
    preview: "Sie sind zu Clubero eingeladen",
    heading: "Sie sind eingeladen",
    intro:
      "Sie wurden eingeladen, Clubero beizutreten. Klicken Sie, um anzunehmen und Ihr Konto zu erstellen.",
    cta: "Einladung annehmen",
    footer: "Wenn Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.",
    signOff: "Das Clubero-Team",
  },
  it: {
    preview: "Sei invitato su Clubero",
    heading: "Sei invitato",
    intro: "Sei stato invitato a unirti a Clubero. Fai clic per accettare e creare il tuo account.",
    cta: "Accetta invito",
    footer: "Se non aspettavi questo invito, ignora questa email.",
    signOff: "Il team Clubero",
  },
  nl: {
    preview: "Je bent uitgenodigd voor Clubero",
    heading: "Je bent uitgenodigd",
    intro:
      "Je bent uitgenodigd om lid te worden van Clubero. Klik om te accepteren en je account aan te maken.",
    cta: "Uitnodiging accepteren",
    footer: "Als je deze uitnodiging niet verwachtte, negeer deze e-mail.",
    signOff: "Het Clubero-team",
  },
  pt: {
    preview: "Está convidado para o Clubero",
    heading: "Está convidado",
    intro: "Foi convidado a juntar-se ao Clubero. Clique para aceitar e criar a sua conta.",
    cta: "Aceitar convite",
    footer: "Se não esperava este convite, ignore este e-mail.",
    signOff: "A equipa Clubero",
  },
};
