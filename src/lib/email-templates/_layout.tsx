import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export type Locale = 'fr' | 'en' | 'es' | 'de' | 'it' | 'nl' | 'pt'

const SUPPORTED_LOCALES: Locale[] = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt']

export const pickLocale = (input?: string | null): Locale => {
  const v = (input ?? '').toLowerCase().slice(0, 2)
  return (SUPPORTED_LOCALES as string[]).includes(v) ? (v as Locale) : 'fr'
}

const LOGO_URL = 'https://www.clubero.app/clubero-logo.png'
const SITE_URL = 'https://www.clubero.app'
const SUPPORT_EMAIL = 'support@clubero.app'

// Palette Clubero premium — tokens partagés
export const EMAIL_COLORS = {
  ink: '#0B1F1A',
  inkSoft: '#3A4A3A',
  muted: '#7A8A7A',
  line: '#E3ECD7',
  surface: '#FFFFFF',
  canvas: '#F4F7EE',
  brand: '#6CBF3A',
  brandDeep: '#3F8A1F',
  brandSoft: '#EEF7E2',
  brandInk: '#0F2A0B',
} as const

const C = EMAIL_COLORS

export const EMAIL_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'

// Bouton premium réutilisable
export const premiumButton: React.CSSProperties = {
  background: `linear-gradient(180deg, ${C.brand} 0%, ${C.brandDeep} 100%)`,
  color: '#FFFFFF',
  fontWeight: 700,
  fontSize: '15px',
  borderRadius: '12px',
  padding: '15px 32px',
  textDecoration: 'none',
  display: 'inline-block',
  letterSpacing: '0.01em',
  boxShadow: '0 4px 12px rgba(63, 138, 31, 0.28)',
}

const FOOTER_COPY: Record<Locale, {
  tagline: string; contact: string; visit: string; sentBy: string; via: string; help: string
}> = {
  fr: {
    tagline: 'La plateforme qui simplifie la vie des clubs sportifs.',
    contact: 'Nous contacter',
    visit: 'clubero.app',
    sentBy: 'Envoyé par',
    via: 'via Clubero',
    help: 'Besoin d’aide ?',
  },
  en: {
    tagline: 'The platform that makes sports club life easier.',
    contact: 'Contact us',
    visit: 'clubero.app',
    sentBy: 'Sent by',
    via: 'via Clubero',
    help: 'Need help?',
  },
  es: {
    tagline: 'La plataforma que simplifica la vida de los clubes deportivos.',
    contact: 'Contáctanos',
    visit: 'clubero.app',
    sentBy: 'Enviado por',
    via: 'vía Clubero',
    help: '¿Necesitas ayuda?',
  },
  de: {
    tagline: 'Die Plattform, die das Vereinsleben einfacher macht.',
    contact: 'Kontakt',
    visit: 'clubero.app',
    sentBy: 'Gesendet von',
    via: 'über Clubero',
    help: 'Brauchen Sie Hilfe?',
  },
  it: {
    tagline: 'La piattaforma che semplifica la vita dei club sportivi.',
    contact: 'Contattaci',
    visit: 'clubero.app',
    sentBy: 'Inviato da',
    via: 'tramite Clubero',
    help: 'Hai bisogno di aiuto?',
  },
  nl: {
    tagline: 'Het platform dat het leven van sportclubs makkelijker maakt.',
    contact: 'Contacteer ons',
    visit: 'clubero.app',
    sentBy: 'Verzonden door',
    via: 'via Clubero',
    help: 'Hulp nodig?',
  },
  pt: {
    tagline: 'A plataforma que simplifica a vida dos clubes desportivos.',
    contact: 'Contactar',
    visit: 'clubero.app',
    sentBy: 'Enviado por',
    via: 'via Clubero',
    help: 'Precisa de ajuda?',
  },
}

const BUTTON_HINT: Record<Locale, { broken: string; open: string }> = {
  fr: { broken: 'Le bouton ne fonctionne pas ?', open: 'Ouvrir le lien' },
  en: { broken: 'Button not working?', open: 'Open the link' },
  es: { broken: '¿El botón no funciona?', open: 'Abrir el enlace' },
  de: { broken: 'Funktioniert der Button nicht?', open: 'Link öffnen' },
  it: { broken: 'Il pulsante non funziona?', open: 'Apri il link' },
  nl: { broken: 'Werkt de knop niet?', open: 'Open de link' },
  pt: { broken: 'O botão não funciona?', open: 'Abrir o link' },
}

/* =================================================================
 * BrandedEmail — utilisé par les emails AUTH (signup, invite, etc.)
 * ================================================================= */

interface BrandedEmailProps {
  preview: string
  heading: string
  intro: string
  ctaLabel?: string
  ctaUrl?: string
  body?: React.ReactNode
  footer: string
  signOff: string
  locale: Locale
}

export const BrandedEmail = ({
  preview,
  heading,
  intro,
  ctaLabel,
  ctaUrl,
  body,
  footer,
  signOff,
  locale,
}: BrandedEmailProps) => {
  const f = FOOTER_COPY[locale]
  return (
    <Html lang={locale} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <PreHeader text={preview} />
      <Body style={shellBody}>
        <Container style={outer}>
          <HeaderBand />
          <Section style={cardAttached}>
            <Text style={h1}>{heading}</Text>
            <Text style={text}>{intro}</Text>
            {body}
            {ctaLabel && ctaUrl ? (
              <Section style={{ textAlign: 'center', margin: '32px 0 8px' }}>
                <Button style={premiumButton} href={ctaUrl}>
                  {ctaLabel}
                </Button>
                <Text style={ctaHint}>
                  {locale === 'fr' ? 'Le bouton ne fonctionne pas ?' : 'Button not working?'}{' '}
                  <Link href={ctaUrl} style={inlineLink}>
                    {locale === 'fr' ? 'Ouvrir le lien' : 'Open the link'}
                  </Link>
                </Text>
              </Section>
            ) : null}
            <Hr style={hr} />
            <Text style={text}>{footer}</Text>
            <Text style={signature}>{signOff}</Text>
          </Section>
          <StandardFooter locale={locale} f={f} />
        </Container>
      </Body>
    </Html>
  )
}

/* =================================================================
 * EmailShell — utilisé par les emails TRANSACTIONNELS (convocations,
 * tournois, support, etc.). Fournit header + carte + footer brandés ;
 * les templates injectent leur contenu spécifique en children.
 * ================================================================= */

interface EmailShellProps {
  preview: string
  locale?: Locale | string
  /** Nom du club expéditeur (affiché dans le footer "Envoyé par ...") */
  clubName?: string
  /** Logo du club (affiché en haut de la carte sous le bandeau Clubero) */
  clubLogoUrl?: string
  /** Sous-titre kicker au-dessus du logo club (ex: "TOURNOI", "CONVOCATION") */
  kicker?: string
  children: React.ReactNode
}

export const EmailShell = ({
  preview,
  locale,
  clubName,
  clubLogoUrl,
  kicker,
  children,
}: EmailShellProps) => {
  const l: Locale = pickLocale(typeof locale === 'string' ? locale : (locale as string | undefined))
  const f = FOOTER_COPY[l]
  const sender = clubName?.trim()
  return (
    <Html lang={l} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <PreHeader text={preview} />
      <Body style={shellBody}>
        <Container style={outer}>
          <HeaderBand />
          <Section style={cardAttached}>
            {clubLogoUrl || kicker ? (
              <Section style={clubHeader}>
                {clubLogoUrl ? (
                  <Img
                    src={clubLogoUrl}
                    alt={sender ?? ''}
                    width="64"
                    height="64"
                    style={clubLogo}
                  />
                ) : null}
                {kicker ? <Text style={clubKicker}>{kicker}</Text> : null}
              </Section>
            ) : null}
            {children}
          </Section>
          <Section style={footerWrap}>
            {sender ? (
              <Text style={sentByLine}>
                {f.sentBy} <strong style={{ color: C.ink }}>{sender}</strong> {f.via}
              </Text>
            ) : null}
            <Text style={tagline}>{f.tagline}</Text>
            <Text style={footerLinks}>
              <Link href={SITE_URL} style={footerLink}>
                {f.visit}
              </Link>
              <span style={dot}>·</span>
              <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>
                {f.contact}
              </Link>
            </Text>
            <Text style={copyright}>
              © {new Date().getFullYear()} Clubero — {f.help}{' '}
              <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>
                {SUPPORT_EMAIL}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/* =================================================================
 * Sous-composants internes
 * ================================================================= */

const HeaderBand = () => (
  <>
    <Section style={headerAccent} />
    <Section style={headerBand}>
      <Link href={SITE_URL} style={{ textDecoration: 'none' }}>
        <Img src={LOGO_URL} alt="Clubero" width="168" height="112" style={logo} />
      </Link>
    </Section>
  </>
)

const PreHeader = ({ text }: { text: string }) => (
  <div
    style={{
      display: 'none',
      overflow: 'hidden',
      lineHeight: '1px',
      opacity: 0,
      maxHeight: 0,
      maxWidth: 0,
    }}
  >
    {text}
    {'\u00A0\u200C\u00A0\u200C\u00A0\u200C\u00A0\u200C'.repeat(60)}
  </div>
)

const StandardFooter = ({
  locale,
  f,
}: {
  locale: Locale
  f: (typeof FOOTER_COPY)[Locale]
}) => (
  <Section style={footerWrap}>
    <Text style={tagline}>{f.tagline}</Text>
    <Text style={footerLinks}>
      <Link href={SITE_URL} style={footerLink}>
        {f.visit}
      </Link>
      <span style={dot}>·</span>
      <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>
        {f.contact}
      </Link>
    </Text>
    <Text style={copyright}>
      © {new Date().getFullYear()} Clubero — {f.help}{' '}
      <Link href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>
        {SUPPORT_EMAIL}
      </Link>
    </Text>
  </Section>
)

/* ---------- Styles partagés ---------- */

const shellBody: React.CSSProperties = {
  backgroundColor: C.canvas,
  fontFamily: EMAIL_FONT_STACK,
  margin: 0,
  padding: '32px 0 48px',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
}

const outer: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0 16px',
}

const headerAccent: React.CSSProperties = {
  background: `linear-gradient(90deg, ${C.brandDeep} 0%, ${C.brand} 100%)`,
  height: '4px',
  borderRadius: '18px 18px 0 0',
  fontSize: 0,
  lineHeight: '4px',
}

const headerBand: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderLeft: `1px solid ${C.line}`,
  borderRight: `1px solid ${C.line}`,
  padding: '28px 28px 22px',
  textAlign: 'center',
}

const logo: React.CSSProperties = {
  display: 'inline-block',
  maxWidth: '100%',
  height: 'auto',
}

const cardAttached: React.CSSProperties = {
  backgroundColor: C.surface,
  border: `1px solid ${C.line}`,
  borderTop: 'none',
  borderRadius: '0 0 18px 18px',
  padding: '36px 32px 32px',
  boxShadow: '0 1px 2px rgba(15, 31, 26, 0.04)',
}

const clubHeader: React.CSSProperties = {
  textAlign: 'center',
  margin: '0 0 22px',
}

const clubLogo: React.CSSProperties = {
  display: 'inline-block',
  borderRadius: '14px',
  objectFit: 'cover',
  border: `2px solid ${C.line}`,
}

const clubKicker: React.CSSProperties = {
  fontSize: '11px',
  letterSpacing: '1.5px',
  color: C.brandDeep,
  fontWeight: 700,
  margin: '10px 0 0',
  textTransform: 'uppercase',
  textAlign: 'center',
}

const h1: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: C.ink,
  margin: '0 0 18px',
  lineHeight: 1.25,
  letterSpacing: '-0.01em',
}

const text: React.CSSProperties = {
  fontSize: '15px',
  color: C.inkSoft,
  lineHeight: 1.65,
  margin: '0 0 16px',
}

const ctaHint: React.CSSProperties = {
  fontSize: '12px',
  color: C.muted,
  margin: '14px 0 0',
}

const inlineLink: React.CSSProperties = {
  color: C.brandDeep,
  textDecoration: 'underline',
}

const hr: React.CSSProperties = {
  borderColor: C.line,
  borderStyle: 'solid',
  borderWidth: '1px 0 0',
  margin: '28px 0 20px',
}

const signature: React.CSSProperties = {
  fontSize: '14px',
  color: C.inkSoft,
  margin: '8px 0 0',
  whiteSpace: 'pre-line',
}

const footerWrap: React.CSSProperties = {
  textAlign: 'center',
  padding: '24px 16px 0',
}

const sentByLine: React.CSSProperties = {
  fontSize: '13px',
  color: C.inkSoft,
  margin: '0 0 10px',
}

const tagline: React.CSSProperties = {
  fontSize: '13px',
  color: C.inkSoft,
  margin: '0 0 10px',
  fontStyle: 'italic',
}

const footerLinks: React.CSSProperties = {
  fontSize: '13px',
  color: C.muted,
  margin: '0 0 8px',
}

const footerLink: React.CSSProperties = {
  color: C.brandDeep,
  textDecoration: 'none',
  fontWeight: 600,
}

const dot: React.CSSProperties = {
  margin: '0 8px',
  color: C.muted,
}

const copyright: React.CSSProperties = {
  fontSize: '12px',
  color: C.muted,
  margin: '8px 0 0',
  lineHeight: 1.6,
}
