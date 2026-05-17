# Public API endpoints — `/api/public/*`

These TanStack server routes bypass the platform's published-site auth and
are intended for **external callers** (webhooks, cron, marketing forms).

All endpoints live under `src/routes/api/public/`. Base URLs:

- Production: `https://www.clubero.app`
- Stable preview: `https://project--619b13f2-91ef-4dee-b96c-f49b38d86b39-dev.lovable.app`

> Every public endpoint MUST authenticate the caller (signature, shared
> secret, or rate-limited honeypot). Never return PII.

---

## `POST /api/public/stripe-webhook`

Stripe billing events. Verified with `STRIPE_WEBHOOK_SECRET` via
`stripe.webhooks.constructEvent`. Handles `customer.subscription.*`,
`invoice.payment_*`, `checkout.session.completed`.

- **Auth**: Stripe signature header `stripe-signature`
- **Body**: raw Stripe event JSON
- **Response**: `200 {received:true}` on success, `400` on bad signature

## `POST /api/public/inquiry`

Marketing contact form submissions. Rate-limited by IP + honeypot field.

- **Auth**: honeypot (`website` field must be empty) + per-IP throttle
- **Body**: `{ name, email, message, source?, website? }`
- **Response**: `200 {ok:true}` or `400` validation error / `429` throttle

## `POST /api/public/marketing-chat`

Public chat widget streaming to the AI gateway. Rate-limited per IP.

- **Auth**: per-IP throttle, prompt length cap
- **Body**: `{ messages: [{role, content}] }`
- **Response**: text/event-stream

## `POST /api/public/hooks/event-reminders`

Cron-triggered. Sends D-1 reminders for upcoming events.

- **Auth**: `Authorization: Bearer ${CRON_SECRET}`
- **Schedule**: every 15 min via Supabase pg_cron
- **Response**: `200 {sent:n}`

## `POST /api/public/hooks/trial-reminders`

Cron-triggered. Notifies admins when trial is ending in 3 / 1 / 0 days.

- **Auth**: `Authorization: Bearer ${CRON_SECRET}`
- **Schedule**: daily at 09:00 UTC
- **Response**: `200 {sent:n}`

## `POST /api/public/hooks/data-retention`

Cron-triggered. Purges data per `docs/privacy/retention.md`:
soft-delete inactive accounts > 36 mo, hard-delete archived clubs > 12 mo,
trim `email_send_log` > 90 days, trim `audit_logs` > 24 mo.

- **Auth**: `Authorization: Bearer ${DATA_RETENTION_SECRET}`
- **Schedule**: daily at 03:00 UTC
- **Response**: `200 {purged: {...}}`

---

## Conventions

- All handlers validate body with **Zod** before any side effect.
- Errors are logged via `createLogger("public:<endpoint>")` from
  `src/lib/logger.server.ts` (JSON, PII-redacted).
- Never use `supabaseAdmin` writes before verifying the caller.
- Never echo back request body in error responses.
