import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
import { template as playerInviteTemplate } from './player-invite'
import { template as convocationResponseTemplate } from './convocation-response'
import { template as convocationInviteTemplate } from './convocation-invite'
import { template as subscriptionAdminNotificationTemplate } from './subscription-admin-notification'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'player-invite': playerInviteTemplate,
  'convocation-response': convocationResponseTemplate,
  'convocation-invite': convocationInviteTemplate,
  'subscription-admin-notification': subscriptionAdminNotificationTemplate,
}
