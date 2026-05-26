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

export type Locale = 'fr' | 'en'

export const pickLocale = (input?: string | null): Locale =>
  (input ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en'

const LOGO_URL = 'https://www.clubero.app/clubero-logo.png'
const SITE_URL = 'https://www.clubero.app'
const SUPPORT_EMAIL = 'support@clubero.app'

// Palette Clubero premium
const COLORS = {
  ink: '#0B1F1A',          // texte principal, profond
  inkSoft: '#3A4A3A',      // texte secondaire
  muted: '#7A8A7A',         // texte tertiaire
  line: '#E3ECD7',          // bordures douces
  surface: '#FFFFFF',       // carte principale
  canvas: '#F4F7EE',        // fond email
  brand: '#6CBF3A',         // vert signature
  brandDeep: '#3F8A1F',     // vert foncé (dégradé/CTA)
  brandInk: '#0F2A0B',      // contraste sur vert
}

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

const FOOTER_COPY = {
  fr: {
    tagline: 'La plateforme qui simplifie la vie des clubs sportifs.',
    help: 'Besoin d’aide ?',
    contact: 'Nous contacter',
    visit: 'clubero.app',
  },
  en: {
    tagline: 'The platform that makes sports club life easier.',
    help: 'Need help?',
    contact: 'Contact us',
    visit: 'clubero.app',
  },
} as const

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
      {/* Preheader caché pour optimiser l'aperçu boîte mail */}
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
        {preview}
        {'\u00A0\u200C\u00A0\u200C\u00A0\u200C\u00A0\u200C'.repeat(60)}
      </div>
      <Body style={main}>
        <Container style={outer}>
          {/* Bandeau header dégradé */}
          <Section style={headerBand}>
            <Link href={SITE_URL} style={{ textDecoration: 'none' }}>
              <Img
                src={LOGO_URL}
                alt="Clubero"
                width="132"
                height="32"
                style={logo}
              />
            </Link>
          </Section>

          {/* Carte principale */}
          <Section style={card}>
            <Text style={h1}>{heading}</Text>
            <Text style={text}>{intro}</Text>
            {body}
            {ctaLabel && ctaUrl ? (
              <Section style={{ textAlign: 'center', margin: '32px 0 8px' }}>
                <Button style={button} href={ctaUrl}>
                  {ctaLabel}
                </Button>
                <Text style={ctaHint}>
                  {locale === 'fr'
                    ? 'Le bouton ne fonctionne pas ?'
                    : "Button not working?"}{' '}
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

          {/* Footer */}
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
        </Container>
      </Body>
    </Html>
  )
}

/* ---------- Styles ---------- */

const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'

const main: React.CSSProperties = {
  backgroundColor: COLORS.canvas,
  fontFamily: fontStack,
  margin: 0,
  padding: '32px 0 48px',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
}

const outer: React.CSSProperties = {
  maxWidth: '580px',
  margin: '0 auto',
  padding: '0 16px',
}

const headerBand: React.CSSProperties = {
  background: `linear-gradient(135deg, ${COLORS.brandDeep} 0%, ${COLORS.brand} 100%)`,
  borderRadius: '18px 18px 0 0',
  padding: '28px 28px 26px',
  textAlign: 'center',
}

const logo: React.CSSProperties = {
  display: 'inline-block',
  filter: 'brightness(0) invert(1)', // logo en blanc sur fond vert
}

const card: React.CSSProperties = {
  backgroundColor: COLORS.surface,
  border: `1px solid ${COLORS.line}`,
  borderTop: 'none',
  borderRadius: '0 0 18px 18px',
  padding: '36px 32px 32px',
  boxShadow: '0 1px 2px rgba(15, 31, 26, 0.04)',
}

const h1: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: COLORS.ink,
  margin: '0 0 18px',
  lineHeight: 1.25,
  letterSpacing: '-0.01em',
}

const text: React.CSSProperties = {
  fontSize: '15px',
  color: COLORS.inkSoft,
  lineHeight: 1.65,
  margin: '0 0 16px',
}

const button: React.CSSProperties = {
  background: `linear-gradient(180deg, ${COLORS.brand} 0%, ${COLORS.brandDeep} 100%)`,
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

const ctaHint: React.CSSProperties = {
  fontSize: '12px',
  color: COLORS.muted,
  margin: '14px 0 0',
}

const inlineLink: React.CSSProperties = {
  color: COLORS.brandDeep,
  textDecoration: 'underline',
}

const hr: React.CSSProperties = {
  borderColor: COLORS.line,
  borderStyle: 'solid',
  borderWidth: '1px 0 0',
  margin: '28px 0 20px',
}

const signature: React.CSSProperties = {
  fontSize: '14px',
  color: COLORS.inkSoft,
  margin: '8px 0 0',
  whiteSpace: 'pre-line',
}

const footerWrap: React.CSSProperties = {
  textAlign: 'center',
  padding: '24px 16px 0',
}

const tagline: React.CSSProperties = {
  fontSize: '13px',
  color: COLORS.inkSoft,
  margin: '0 0 10px',
  fontStyle: 'italic',
}

const footerLinks: React.CSSProperties = {
  fontSize: '13px',
  color: COLORS.muted,
  margin: '0 0 8px',
}

const footerLink: React.CSSProperties = {
  color: COLORS.brandDeep,
  textDecoration: 'none',
  fontWeight: 600,
}

const dot: React.CSSProperties = {
  margin: '0 8px',
  color: COLORS.muted,
}

const copyright: React.CSSProperties = {
  fontSize: '12px',
  color: COLORS.muted,
  margin: '8px 0 0',
  lineHeight: 1.6,
}
