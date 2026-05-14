import * as React from 'react'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface Props {
  confirmationUrl: string
  oldEmail?: string
  newEmail?: string
  locale?: string
}

const COPY = {
  fr: {
    preview: 'Confirmez votre nouvelle adresse email Clubero',
    heading: 'Confirmez votre nouvelle adresse email',
    intro:
      'Une demande de changement d’adresse email a été faite sur votre compte Clubero. Cliquez ci-dessous pour confirmer votre nouvelle adresse.',
    cta: 'Confirmer la nouvelle adresse',
    footer:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre adresse actuelle restera inchangée.",
    signOff: "À bientôt,\nL'équipe Clubero",
  },
  en: {
    preview: 'Confirm your new Clubero email address',
    heading: 'Confirm your new email address',
    intro:
      'A request was made to change the email address on your Clubero account. Click below to confirm your new address.',
    cta: 'Confirm new address',
    footer:
      "If you didn't request this change, ignore this message — your current address won't change.",
    signOff: 'Talk soon,\nThe Clubero team',
  },
} as const

export const EmailChangeEmail = ({ confirmationUrl, oldEmail, newEmail, locale }: Props) => {
  const l: Locale = pickLocale(locale)
  const c = COPY[l]
  const detail =
    oldEmail && newEmail
      ? l === 'fr'
        ? `De ${oldEmail} vers ${newEmail}.`
        : `From ${oldEmail} to ${newEmail}.`
      : null
  return (
    <BrandedEmail
      locale={l}
      preview={c.preview}
      heading={c.heading}
      intro={c.intro}
      ctaLabel={c.cta}
      ctaUrl={confirmationUrl}
      body={detail ? <p style={{ fontSize: 14, color: '#3a4a3a', margin: '0 0 16px' }}>{detail}</p> : undefined}
      footer={c.footer}
      signOff={c.signOff}
    />
  )
}

export default EmailChangeEmail
