import * as React from 'react'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface Props {
  confirmationUrl: string
  locale?: string
}

const COPY = {
  fr: {
    preview: 'Votre lien de connexion Clubero',
    heading: 'Votre lien de connexion',
    intro:
      'Cliquez sur le bouton ci-dessous pour vous connecter à votre compte Clubero. Aucun mot de passe nécessaire.',
    cta: 'Se connecter à Clubero',
    footer:
      "Ce lien est à usage unique et expire prochainement. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    signOff: "À bientôt,\nL'équipe Clubero",
  },
  en: {
    preview: 'Your Clubero login link',
    heading: 'Your login link',
    intro:
      'Click the button below to sign in to your Clubero account. No password required.',
    cta: 'Sign in to Clubero',
    footer:
      "This link is single-use and expires soon. If you didn't request it, just ignore this message.",
    signOff: 'Talk soon,\nThe Clubero team',
  },
} as const

export const MagicLinkEmail = ({ confirmationUrl, locale }: Props) => {
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

export default MagicLinkEmail
