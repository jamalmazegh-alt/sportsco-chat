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

Marketing contact form submissions. Protected by a honeypot field and a
fixed-window per-IP rate limit (5 requests/hour) backed by the
`public_rate_limits` table.

- **Auth**: honeypot (`website` field must be empty — bot submissions are
  silently accepted and dropped) + per-IP throttle (5/h)
- **Body**: `{ kind, name, email, message, ..., website? }`
- **Response**: `200 {success:true}` (also on honeypot drop), `400` on
  validation error, `429` on throttle

## `POST /api/public/marketing-chat`

Public chat widget streaming to the AI gateway. Per-IP fixed-window rate
limit (20 requests/hour) and a 2000-character cap per message to prevent
LLM cost abuse.

- **Auth**: per-IP throttle (20/h), 2000-char cap per message
- **Body**: `{ messages: [{role, content}] }` (max 40 messages)
- **Response**: text/event-stream, `413` if a message exceeds the size cap,
  `429` on throttle


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
