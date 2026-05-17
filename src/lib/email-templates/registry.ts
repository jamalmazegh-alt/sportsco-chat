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
import { template as convocationCancelledTemplate } from './convocation-cancelled'
import { template as subscriptionAdminNotificationTemplate } from './subscription-admin-notification'
import { template as eventCancelledTemplate } from './event-cancelled'
import { template as eventRescheduledTemplate } from './event-rescheduled'
import { template as trialReminderTemplate } from './trial-reminder'
import { template as inboundInquiryTemplate } from './inbound-inquiry'
import { template as inquiryConfirmationTemplate } from './inquiry-confirmation'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'inquiry-confirmation': inquiryConfirmationTemplate,
  'player-invite': playerInviteTemplate,
  'convocation-response': convocationResponseTemplate,
  'convocation-invite': convocationInviteTemplate,
  'subscription-admin-notification': subscriptionAdminNotificationTemplate,
  'event-cancelled': eventCancelledTemplate,
  'event-rescheduled': eventRescheduledTemplate,
  'trial-reminder': trialReminderTemplate,
  'inbound-inquiry': inboundInquiryTemplate,
}
