import * as React from 'react'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface Props {
  confirmationUrl: string
  locale?: string
}

const COPY = {
  fr: {
    preview: 'Vous êtes invité·e à rejoindre Clubero',
    heading: 'Vous êtes invité·e sur Clubero',
    intro:
      'Un club vous invite à rejoindre Clubero, la plateforme qui simplifie la vie des clubs sportifs, des entraîneurs, des joueurs et de leurs familles.',
    cta: "Accepter l'invitation",
    footer:
      "Si vous pensez avoir reçu cette invitation par erreur, vous pouvez ignorer ce message.",
    signOff: "À très vite,\nL'équipe Clubero",
  },
  en: {
    preview: "You've been invited to join Clubero",
    heading: "You've been invited to Clubero",
    intro:
      "A club is inviting you to join Clubero — the platform that makes life easier for sports clubs, coaches, players and their families.",
    cta: 'Accept the invitation',
    footer:
      "If you think you received this invitation by mistake, you can safely ignore this message.",
    signOff: 'See you soon,\nThe Clubero team',
  },
} as const

export const InviteEmail = ({ confirmationUrl, locale }: Props) => {
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

export default InviteEmail
