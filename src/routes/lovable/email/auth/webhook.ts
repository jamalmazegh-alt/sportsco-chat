import * as React from 'react'
import { render } from '@react-email/components'
import { parseEmailWebhookPayload } from '@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from '@lovable.dev/webhooks-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirmez votre email Clubero',
  invite: 'Vous êtes invité·e sur Clubero',
  magiclink: 'Votre lien de connexion Clubero',
  recovery: 'Réinitialisez votre mot de passe Clubero',
  email_change: 'Confirmez votre nouvelle adresse email Clubero',
  reauthentication: 'Votre code de vérification Clubero',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "Clubero"
const SENDER_DOMAIN = "notify.clubero.app"
const ROOT_DOMAIN = "clubero.app"
const FROM_DOMAIN = "clubero.app"

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart[0]}***@${domain}`
}

// Short, non-reversible fingerprint (first 8 hex of SHA-256). Used to compare
// *which* secret the deployed Worker is running across attempts WITHOUT logging
// the secret itself.
async function shortFingerprint(input: string | null | undefined): Promise<string> {
  if (!input) return 'none'
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// DIAGNOSTIC (temporary — remove once the reset-email root cause is confirmed).
// Both Supabase and the Lovable proxy sign with the Standard Webhooks scheme, so
// when password-reset emails silently fail we cannot tell "the proxy never
// reached our Worker" (no row at all) from "reached us but we rejected the
// signature" (row present). The verification-failure path returns 401 *before*
// the `pending` insert, leaving zero trace. This persists a durable trace on
// rejection. It logs only header presence and short non-reversible fingerprints
// — never any secret.
async function logWebhookRejection(
  request: Request,
  info: { path: 'supabase' | 'lovable'; reason: string; keyFingerprint: string },
): Promise<void> {
  try {
    const relevant = [
      'webhook-id',
      'webhook-timestamp',
      'webhook-signature',
      'x-lovable-signature',
      'x-lovable-timestamp',
    ]
    const headersPresent = relevant.filter((h) => request.headers.get(h) !== null)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    await supabaseAdmin.from('email_send_log').insert({
      template_name: 'auth_webhook_diag',
      recipient_email: '(rejected)',
      status: 'failed',
      error_message: `${info.path} path rejected: ${info.reason}`,
      metadata: {
        path: info.path,
        reason: info.reason,
        worker_key_fingerprint: info.keyFingerprint,
        headers_present: headersPresent,
      },
    })
  } catch (logError) {
    console.error('Failed to record webhook-rejection diagnostic', { error: logError })
  }
}

// Verify a Supabase HTTP hook request signed with Standard Webhooks
// (headers: webhook-id, webhook-timestamp, webhook-signature).
// Secret format from Supabase dashboard: "v1,whsec_<base64>".
async function verifySupabaseSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatureHeader = headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader) return false

  // Reject stale (>5 min skew)
  const tsNum = Number(timestamp)
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false

  const cleaned = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')
  let keyBytes: Uint8Array
  try {
    const bin = atob(cleaned)
    keyBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    // Fall back to raw utf8 if not base64
    keyBytes = new TextEncoder().encode(cleaned)
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const data = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
  const sigBuf = await crypto.subtle.sign('HMAC', key, data)
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))

  // Header may contain multiple "v1,<sig>" entries separated by space
  for (const part of signatureHeader.split(' ')) {
    const [, sig] = part.split(',')
    if (sig && sig === expected) return true
  }
  return false
}

function mapSupabasePayload(body: any) {
  const action_type = body?.email_data?.email_action_type
  const email = body?.user?.email
  const token = body?.email_data?.token
  const token_hash = body?.email_data?.token_hash
  const site_url = (body?.email_data?.site_url || '').replace(/\/+$/, '')
  const redirect_to = body?.email_data?.redirect_to || ''
  const url = site_url && token_hash
    ? `${site_url}/auth/v1/verify?token=${encodeURIComponent(token_hash)}&type=${encodeURIComponent(action_type)}&redirect_to=${encodeURIComponent(redirect_to)}`
    : ''
  return {
    version: '1',
    data: {
      action_type,
      email,
      token,
      url,
      new_email: body?.email_data?.new_email,
      old_email: body?.user?.email,
    },
  }
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authSecret = process.env.AUTH_WEBHOOK_SECRET
        const apiKey = process.env.LOVABLE_API_KEY
        const isSupabaseHook = request.headers.get('webhook-signature') !== null

        let payload: any
        let run_id = ''

        if (isSupabaseHook) {
          if (!authSecret) {
            console.error('AUTH_WEBHOOK_SECRET not configured')
            return Response.json({ error: 'Server configuration error' }, { status: 500 })
          }
          const rawBody = await request.text()
          const ok = await verifySupabaseSignature(rawBody, request.headers, authSecret)
          if (!ok) {
            console.error('Invalid Supabase webhook signature')
            await logWebhookRejection(request, {
              path: 'supabase',
              reason: 'invalid_signature',
              keyFingerprint: await shortFingerprint(authSecret),
            })
            return Response.json({ error: 'Invalid signature' }, { status: 401 })
          }
          let parsed: any
          try {
            parsed = JSON.parse(rawBody)
          } catch {
            return Response.json({ error: 'Invalid JSON' }, { status: 400 })
          }
          payload = mapSupabasePayload(parsed)
          run_id = request.headers.get('webhook-id') || crypto.randomUUID()
        } else {
          if (!apiKey) {
            console.error('LOVABLE_API_KEY not configured')
            return Response.json({ error: 'Server configuration error' }, { status: 500 })
          }
          try {
            const verified = await verifyWebhookRequest({
              req: request,
              secret: apiKey,
              parser: parseEmailWebhookPayload,
            })
            payload = verified.payload
            run_id = payload.run_id
          } catch (error) {
            if (error instanceof WebhookError) {
              switch (error.code) {
                case 'invalid_signature':
                case 'invalid_timestamp':
                case 'stale_timestamp':
                  // Well-formed signed request that failed verification — almost
                  // always a LOVABLE_API_KEY mismatch between the Lovable proxy
                  // (signer) and this Worker (verifier). Persist a durable trace.
                  console.error('Invalid webhook signature', { code: error.code, error: error.message })
                  await logWebhookRejection(request, {
                    path: 'lovable',
                    reason: error.code,
                    keyFingerprint: await shortFingerprint(apiKey),
                  })
                  return Response.json({ error: 'Invalid signature' }, { status: 401 })
                case 'missing_timestamp':
                  // Unsigned junk — do not persist, to avoid spamming the log.
                  console.error('Invalid webhook signature', { error: error.message })
                  return Response.json({ error: 'Invalid signature' }, { status: 401 })
                case 'invalid_payload':
                case 'invalid_json':
                  console.error('Invalid webhook payload', { error: error.message })
                  return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })
              }
            }
            console.error('Webhook verification failed', { error })
            return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })
          }
        }

        if (!run_id) {
          console.error('Webhook payload missing run_id')
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (payload.version !== '1') {
          console.error('Unsupported payload version', { version: payload.version, run_id })
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 }
          )
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const emailType = payload.data.action_type
        console.log('Received auth event', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        const EmailTemplate = EMAIL_TEMPLATES[emailType]
        if (!EmailTemplate) {
          console.error('Unknown email type', { emailType, run_id })
          return Response.json(
            { error: `Unknown email type: ${emailType}` },
            { status: 400 }
          )
        }

        // Build template props from payload.data (HookData structure)
        const templateProps = {
          siteName: SITE_NAME,
          siteUrl: `https://${ROOT_DOMAIN}`,
          recipient: payload.data.email,
          confirmationUrl: payload.data.url,
          token: payload.data.token,
          email: payload.data.email,
          oldEmail: payload.data.old_email,
          newEmail: payload.data.new_email,
        }

        // Render React Email to HTML and plain text
        const element = React.createElement(EmailTemplate, templateProps)
        const html = await render(element)
        const text = await render(element, { plainText: true })

        // Enqueue email for async processing by the dispatcher (process-email-queue).
        const { supabaseAdmin: supabase } = await import('@/integrations/supabase/client.server')
        const messageId = crypto.randomUUID()

        // Log pending BEFORE enqueue so we have a record even if enqueue crashes
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: payload.data.email,
          status: 'pending',
        })

        const { error: enqueueError } = await supabase.rpc('enqueue_email', {
          queue_name: 'auth_emails',
          payload: {
            run_id,
            message_id: messageId,
            to: payload.data.email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: EMAIL_SUBJECTS[emailType] || 'Notification',
            html,
            text,
            purpose: 'transactional',
            label: emailType,
            queued_at: new Date().toISOString(),
          },
        })

        if (enqueueError) {
          console.error('Failed to enqueue auth email', { error: enqueueError, run_id, emailType })
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: emailType,
            recipient_email: payload.data.email,
            status: 'failed',
            error_message: 'Failed to enqueue email',
          })
          return Response.json(
            { error: 'Failed to enqueue email' },
            { status: 500 }
          )
        }

        console.log('Auth email enqueued', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        return Response.json({ success: true, queued: true })
      },
    },
  },
})
