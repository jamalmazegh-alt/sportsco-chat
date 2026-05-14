import * as React from 'react'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface Props {
  token?: string
  locale?: string
}

const COPY = {
  fr: {
    preview: 'Votre code de vérification Clubero',
    heading: 'Votre code de vérification',
    intro:
      'Pour confirmer votre identité, saisissez le code ci-dessous dans Clubero. Il est valable quelques minutes.',
    footer:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message et changez votre mot de passe.",
    signOff: "À bientôt,\nL'équipe Clubero",
  },
  en: {
    preview: 'Your Clubero verification code',
    heading: 'Your verification code',
    intro:
      'To confirm your identity, enter the code below in Clubero. It’s valid for a few minutes.',
    footer:
      "If you didn't request this code, ignore this message and change your password.",
    signOff: 'Talk soon,\nThe Clubero team',
  },
} as const

export const ReauthenticationEmail = ({ token, locale }: Props) => {
  const l: Locale = pickLocale(locale)
  const c = COPY[l]
  return (
    <BrandedEmail
      locale={l}
      preview={c.preview}
      heading={c.heading}
      intro={c.intro}
      body={
        <div
          style={{
            textAlign: 'center',
            fontSize: '32px',
            letterSpacing: '8px',
            fontWeight: 700,
            color: '#1f3320',
            backgroundColor: '#ffffff',
            border: '1px solid #e3ecd7',
            borderRadius: '12px',
            padding: '20px 16px',
            margin: '8px 0 24px',
          }}
        >
          {token ?? '------'}
        </div>
      }
      footer={c.footer}
      signOff={c.signOff}
    />
  )
}

export default ReauthenticationEmail
