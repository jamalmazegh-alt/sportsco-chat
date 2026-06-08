# Lovable token rotation

## Context

An old Supabase migration used a Lovable project token as a `__lovable_token`
query parameter for the `process-email-queue` cron callback. The current cron
callback no longer needs that token: it calls the production app URL and uses
the `Authorization` header sourced from Supabase Vault
(`email_queue_service_role_key`).

## Repository cleanup

- Do not commit Lovable project tokens in migrations, docs, or environment files.
- Do not add `__lovable_token` to cron callback URLs.
- Keep email queue authentication in the `Authorization` header via Vault.

## External rotation checklist

If a Lovable project token was ever committed or exposed:

1. Revoke or rotate the exposed token in Lovable.
2. Confirm Supabase cron job `process-email-queue` points to:
   `https://clubero.app/lovable/email/queue/process`
3. Confirm the cron command does not contain `__lovable_token`.
4. Confirm Vault secret `email_queue_service_role_key` is present and current.
5. Run a queue-processing smoke test from a non-production-safe email template
   or staging queue before relying on the cron in production.
