import * as React from 'react'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface Props {
  confirmationUrl: string
  locale?: string
}

const COPY = {
  fr: {
    preview: 'Réinitialisez votre mot de passe Clubero',
    heading: 'Réinitialisation de votre mot de passe',
    intro:
      "Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte Clubero. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.",
    cta: 'Choisir un nouveau mot de passe',
    footer:
      "Ce lien est valable pour une durée limitée. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message — votre mot de passe ne sera pas modifié.",
    signOff: "À bientôt,\nL'équipe Clubero",
  },
  en: {
    preview: 'Reset your Clubero password',
    heading: 'Reset your password',
    intro:
      'We received a request to reset the password for your Clubero account. Click the button below to choose a new one.',
    cta: 'Choose a new password',
    footer:
      "This link is valid for a limited time. If you didn't request a reset, just ignore this message — your password won't change.",
    signOff: 'Talk soon,\nThe Clubero team',
  },
} as const

export const RecoveryEmail = ({ confirmationUrl, locale }: Props) => {
  const l: Locale = pickLocale(locale)
  const c = COPY[l]
  return (
    <BrandedEmail
      locale={l}
      preview={c.preview}
      heading={c.heading}
      intro={c.intro}
      ctaLabel={c.cta}
      ctaUrl={confirmationUrl}
      footer={c.footer}
      signOff={c.signOff}
    />
  )
}

export default RecoveryEmail
