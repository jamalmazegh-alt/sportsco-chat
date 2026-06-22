import * as React from 'react'
import { Text } from '@react-email/components'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface ReauthenticationEmailProps {
  token: string
  locale?: string
}

export const ReauthenticationEmail = ({ token, locale }: ReauthenticationEmailProps) => {
  const l: Locale = pickLocale(locale)
  const t = COPY[l]
  return (
    <BrandedEmail
      locale={l}
      preview={t.preview}
      heading={t.heading}
      intro={t.intro}
      body={
        <Text style={codeStyle}>{token}</Text>
      }
      footer={t.footer}
      signOff={t.signOff}
    />
  )
}

export default ReauthenticationEmail

const codeStyle: React.CSSProperties = {
  display: 'inline-block',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '6px',
  color: '#0B1F1A',
  background: '#EEF7E2',
  padding: '14px 22px',
  borderRadius: '12px',
  margin: '8px 0 0',
}

const COPY: Record<Locale, { preview: string; heading: string; intro: string; footer: string; signOff: string }> = {
  fr: { preview: 'Votre code de vérification Clubero', heading: 'Confirmer votre identité', intro: 'Utilisez le code ci-dessous pour confirmer votre identité :', footer: "Ce code expire rapidement. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.", signOff: "L'équipe Clubero" },
  en: { preview: 'Your Clubero verification code', heading: 'Confirm your identity', intro: 'Use the code below to confirm your identity:', footer: "This code expires shortly. If you didn't request this, ignore this email.", signOff: 'The Clubero team' },
  es: { preview: 'Tu código de verificación Clubero', heading: 'Confirma tu identidad', intro: 'Usa el código de abajo para confirmar tu identidad:', footer: 'Este código caduca pronto. Si no lo solicitaste, ignora este correo.', signOff: 'El equipo de Clubero' },
  de: { preview: 'Ihr Clubero-Verifizierungscode', heading: 'Identität bestätigen', intro: 'Verwenden Sie den folgenden Code, um Ihre Identität zu bestätigen:', footer: 'Dieser Code läuft bald ab. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.', signOff: 'Das Clubero-Team' },
  it: { preview: 'Il tuo codice di verifica Clubero', heading: 'Conferma la tua identità', intro: 'Usa il codice qui sotto per confermare la tua identità:', footer: 'Il codice scade a breve. Se non hai fatto questa richiesta, ignora questa email.', signOff: 'Il team Clubero' },
  nl: { preview: 'Je Clubero verificatiecode', heading: 'Bevestig je identiteit', intro: 'Gebruik de onderstaande code om je identiteit te bevestigen:', footer: 'Deze code verloopt snel. Als je dit niet hebt aangevraagd, negeer deze e-mail.', signOff: 'Het Clubero-team' },
  pt: { preview: 'O seu código de verificação Clubero', heading: 'Confirme a sua identidade', intro: 'Use o código abaixo para confirmar a sua identidade:', footer: 'Este código expira em breve. Se não solicitou isto, ignore este e-mail.', signOff: 'A equipa Clubero' },
}
