import * as React from 'react'
import { Text } from '@react-email/components'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface EmailChangeEmailProps {
  siteName?: string
  oldEmail: string
  email?: string
  newEmail: string
  confirmationUrl: string
  locale?: string
}

export const EmailChangeEmail = ({ oldEmail, newEmail, confirmationUrl, locale }: EmailChangeEmailProps) => {
  const l: Locale = pickLocale(locale)
  const t = COPY[l]
  return (
    <BrandedEmail
      locale={l}
      preview={t.preview}
      heading={t.heading}
      intro={t.intro(oldEmail, newEmail)}
      ctaLabel={t.cta}
      ctaUrl={confirmationUrl}
      body={<Text style={{ fontSize: '14px', color: '#3A4A3A', lineHeight: 1.6 }}>{t.note}</Text>}
      footer={t.footer}
      signOff={t.signOff}
    />
  )
}

export default EmailChangeEmail

const COPY: Record<Locale, { preview: string; heading: string; intro: (a: string, b: string) => string; note: string; cta: string; footer: string; signOff: string }> = {
  fr: { preview: 'Confirmez votre changement d’e-mail Clubero', heading: 'Confirmer le changement d’e-mail', intro: (o, n) => `Vous avez demandé à modifier votre adresse e-mail de ${o} vers ${n}.`, note: 'Cliquez sur le bouton ci-dessous pour confirmer ce changement.', cta: 'Confirmer le changement', footer: "Si vous n'avez pas demandé ce changement, contactez-nous immédiatement.", signOff: "L'équipe Clubero" },
  en: { preview: 'Confirm your Clubero email change', heading: 'Confirm email change', intro: (o, n) => `You requested to change your email address from ${o} to ${n}.`, note: 'Click the button below to confirm this change.', cta: 'Confirm change', footer: "If you didn't request this, contact us immediately.", signOff: 'The Clubero team' },
  es: { preview: 'Confirma el cambio de correo Clubero', heading: 'Confirmar cambio de correo', intro: (o, n) => `Solicitaste cambiar tu correo de ${o} a ${n}.`, note: 'Haz clic en el botón para confirmar este cambio.', cta: 'Confirmar cambio', footer: 'Si no solicitaste este cambio, contáctanos de inmediato.', signOff: 'El equipo de Clubero' },
  de: { preview: 'E-Mail-Änderung bei Clubero bestätigen', heading: 'E-Mail-Änderung bestätigen', intro: (o, n) => `Sie haben beantragt, Ihre E-Mail-Adresse von ${o} auf ${n} zu ändern.`, note: 'Klicken Sie auf die Schaltfläche, um diese Änderung zu bestätigen.', cta: 'Änderung bestätigen', footer: 'Wenn Sie das nicht angefordert haben, kontaktieren Sie uns sofort.', signOff: 'Das Clubero-Team' },
  it: { preview: 'Conferma il cambio email Clubero', heading: 'Conferma cambio email', intro: (o, n) => `Hai richiesto di cambiare la tua email da ${o} a ${n}.`, note: 'Fai clic sul pulsante per confermare il cambio.', cta: 'Conferma cambio', footer: 'Se non hai richiesto questo cambio, contattaci subito.', signOff: 'Il team Clubero' },
  nl: { preview: 'Bevestig je Clubero e-mailwijziging', heading: 'E-mailwijziging bevestigen', intro: (o, n) => `Je hebt verzocht je e-mailadres te wijzigen van ${o} naar ${n}.`, note: 'Klik op de knop om deze wijziging te bevestigen.', cta: 'Wijziging bevestigen', footer: 'Als je dit niet hebt aangevraagd, neem direct contact met ons op.', signOff: 'Het Clubero-team' },
  pt: { preview: 'Confirme a alteração de e-mail Clubero', heading: 'Confirmar alteração de e-mail', intro: (o, n) => `Solicitou alterar o seu e-mail de ${o} para ${n}.`, note: 'Clique no botão para confirmar esta alteração.', cta: 'Confirmar alteração', footer: 'Se não solicitou esta alteração, contacte-nos imediatamente.', signOff: 'A equipa Clubero' },
}
