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
}: BrandedEmailProps) => (
  <Html lang={locale} dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Link href={SITE_URL}>
            <Img src={LOGO_URL} alt="Clubero" width="140" style={logo} />
          </Link>
        </Section>
        <Section style={card}>
          <Text style={h1}>{heading}</Text>
          <Text style={text}>{intro}</Text>
          {body}
          {ctaLabel && ctaUrl ? (
            <Section style={{ textAlign: 'center', margin: '28px 0' }}>
              <Button style={button} href={ctaUrl}>
                {ctaLabel}
              </Button>
            </Section>
          ) : null}
          <Text style={text}>{footer}</Text>
          <Hr style={hr} />
          <Text style={signature}>{signOff}</Text>
        </Section>
        <Text style={smallFooter}>
          © {new Date().getFullYear()} Clubero · <Link href={SITE_URL} style={footerLink}>clubero.app</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
}
const container: React.CSSProperties = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
const logoSection: React.CSSProperties = { textAlign: 'center', padding: '8px 0 20px' }
const logo: React.CSSProperties = { display: 'inline-block' }
const card: React.CSSProperties = {
  backgroundColor: '#f7faf3',
  border: '1px solid #e3ecd7',
  borderRadius: '14px',
  padding: '32px 28px',
}
const h1: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#1f3320',
  margin: '0 0 16px',
  lineHeight: 1.3,
}
const text: React.CSSProperties = {
  fontSize: '15px',
  color: '#3a4a3a',
  lineHeight: 1.6,
  margin: '0 0 16px',
}
const button: React.CSSProperties = {
  backgroundColor: '#6cbf3a',
  color: '#0f1d0f',
  fontWeight: 600,
  fontSize: '15px',
  borderRadius: '10px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr: React.CSSProperties = { borderColor: '#e3ecd7', margin: '24px 0 16px' }
const signature: React.CSSProperties = { fontSize: '14px', color: '#3a4a3a', margin: 0 }
const smallFooter: React.CSSProperties = {
  fontSize: '12px',
  color: '#8a948a',
  textAlign: 'center',
  margin: '20px 0 0',
}
const footerLink: React.CSSProperties = { color: '#6cbf3a', textDecoration: 'none' }
