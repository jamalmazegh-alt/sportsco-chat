import * as React from 'react'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface Props {
  confirmationUrl: string
  locale?: string
}

const COPY = {
  fr: {
    preview: 'Confirmez votre adresse email pour activer votre compte Clubero',
    heading: 'Bienvenue sur Clubero !',
    intro:
      "Merci de votre inscription. Pour activer votre compte et rejoindre votre club, confirmez votre adresse email en cliquant sur le bouton ci-dessous.",
    cta: 'Confirmer mon email',
    footer:
      "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message en toute sécurité.",
    signOff: "À très vite,\nL'équipe Clubero",
  },
  en: {
    preview: 'Confirm your email to activate your Clubero account',
    heading: 'Welcome to Clubero!',
    intro:
      'Thanks for signing up. To activate your account and join your club, confirm your email by clicking the button below.',
    cta: 'Confirm my email',
    footer:
      "If you didn't create this account, you can safely ignore this message.",
    signOff: 'See you soon,\nThe Clubero team',
  },
} as const

export const SignupEmail = ({ confirmationUrl, locale }: Props) => {
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

export default SignupEmail
