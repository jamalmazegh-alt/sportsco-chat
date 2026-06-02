import * as React from 'react'
import { Text } from '@react-email/components'
import { BrandedEmail, pickLocale, type Locale } from './_layout'

interface Props {
  confirmationUrl: string
  locale?: string
  // Champs optionnels passés via user_metadata depuis inviteUserByEmail
  clubName?: string
  inviteRole?: string // ex: "parent", "coach", "dirigeant"
  playerName?: string // nom du joueur pour les invitations parent
  inviterName?: string
}

const ROLE_LABEL: Record<string, { fr: string; en: string }> = {
  parent: { fr: 'parent', en: 'parent' },
  coach: { fr: 'entraîneur·e', en: 'coach' },
  assistant_coach: { fr: 'entraîneur·e adjoint·e', en: 'assistant coach' },
  dirigeant: { fr: 'dirigeant·e', en: 'staff member' },
  manager: { fr: 'dirigeant·e', en: 'manager' },
  admin: { fr: 'administrateur·trice', en: 'administrator' },
  staff: { fr: 'membre du staff', en: 'staff member' },
}

function buildIntro(
  rawL: Locale,
  clubName?: string,
  inviteRole?: string,
  playerName?: string,
): string {
  const l: 'fr' | 'en' = rawL === 'fr' ? 'fr' : 'en'
  const club = clubName?.trim()
  const roleKey = inviteRole?.toLowerCase()
  const roleLabel = roleKey && ROLE_LABEL[roleKey] ? ROLE_LABEL[roleKey][l] : undefined

  if (l === 'fr') {
    if (club && roleKey === 'parent' && playerName) {
      return `${club} vous invite à rejoindre Clubero en tant que parent de ${playerName}. Vous pourrez suivre les convocations, les matchs et toute la vie de l'équipe.`
    }
    if (club && roleLabel) {
      return `${club} vous invite à rejoindre Clubero en tant que ${roleLabel}. Accédez à votre espace pour gérer vos équipes, plannings et communications.`
    }
    if (club) {
      return `${club} vous invite à rejoindre Clubero, la plateforme qui simplifie la vie des clubs sportifs.`
    }
    return "Un club vous invite à rejoindre Clubero, la plateforme qui simplifie la vie des clubs sportifs, des entraîneurs, des joueurs et de leurs familles."
  }

  // EN
  if (club && roleKey === 'parent' && playerName) {
    return `${club} is inviting you to join Clubero as the parent of ${playerName}. You'll be able to follow call-ups, matches and everything happening in the team.`
  }
  if (club && roleLabel) {
    return `${club} is inviting you to join Clubero as ${roleLabel}. Sign in to manage your teams, schedules and communications.`
  }
  if (club) {
    return `${club} is inviting you to join Clubero — the platform that makes sports club life easier.`
  }
  return "A club is inviting you to join Clubero — the platform that makes life easier for sports clubs, coaches, players and their families."
}

const COPY = {
  fr: {
    preview: (club?: string) =>
      club ? `${club} vous invite à rejoindre Clubero` : 'Vous êtes invité·e à rejoindre Clubero',
    heading: (club?: string) =>
      club ? `${club} vous invite sur Clubero` : 'Vous êtes invité·e sur Clubero',
    cta: "Accepter l'invitation",
    footer:
      "Si vous pensez avoir reçu cette invitation par erreur, vous pouvez ignorer ce message.",
    signOff: "À très vite,\nL'équipe Clubero",
    invitedBy: (name: string) => `Invitation envoyée par ${name}.`,
  },
  en: {
    preview: (club?: string) =>
      club ? `${club} invited you to join Clubero` : "You've been invited to join Clubero",
    heading: (club?: string) =>
      club ? `${club} invited you to Clubero` : "You've been invited to Clubero",
    cta: 'Accept the invitation',
    footer:
      "If you think you received this invitation by mistake, you can safely ignore this message.",
    signOff: 'See you soon,\nThe Clubero team',
    invitedBy: (name: string) => `Invitation sent by ${name}.`,
  },
} as const

export const InviteEmail = ({
  confirmationUrl,
  locale,
  clubName,
  inviteRole,
  playerName,
  inviterName,
}: Props) => {
  const l: Locale = pickLocale(locale)
  const c = COPY[l]
  const club = clubName?.trim() || undefined
  const intro = buildIntro(l, club, inviteRole, playerName?.trim() || undefined)
  const body = inviterName?.trim() ? (
    <Text
      style={{
        fontSize: '13px',
        color: '#5a6a5a',
        margin: '0 0 16px',
        fontStyle: 'italic',
      }}
    >
      {c.invitedBy(inviterName.trim())}
    </Text>
  ) : undefined

  return (
    <BrandedEmail
      locale={l}
      preview={c.preview(club)}
      heading={c.heading(club)}
      intro={intro}
      body={body}
      ctaLabel={c.cta}
      ctaUrl={confirmationUrl}
      footer={c.footer}
      signOff={c.signOff}
    />
  )
}

export default InviteEmail
