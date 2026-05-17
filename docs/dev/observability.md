# Observability & Testing

## Structured logging (`src/lib/logger.server.ts`)

All server-side log lines should go through `createLogger(scope)` rather
than raw `console.*`. Output is single-line JSON, ready for any log
aggregator (Logflare, Datadog, Better Stack, etc.).

```ts
import { createLogger } from "@/lib/logger.server";
const log = createLogger("billing");
log.info("checkout_started", { clubId });
log.error("stripe_call_failed", { err, clubId });
```

Sensitive keys (`email`, `phone`, `token`, `authorization`, `secret`,
`api_key`, `stripe_customer_id`, …) are automatically masked. When
adding a new sensitive field, extend `REDACT_KEYS` in the logger.

### Shipping logs externally
Cloudflare Workers expose `console.*` to the platform log drain. Logs
emitted via the logger are already JSON, so any drain (Logpush →
S3/Logflare/Datadog) ingests them directly. No code change needed when
wiring a drain.

## Unit tests — current state

The project does not yet ship a test runner. Recommended next step when
introducing tests:

```bash
bun add -d vitest @vitest/coverage-v8
```

Add `"test": "vitest run"` to `package.json` and seed coverage with:

- `src/lib/logger.server.ts` — PII redaction edge cases
- `src/lib/superadmin/ui.tsx` — pure formatters (`formatMoney`,
  `trialCountdown`, `subTone`)
- `src/lib/legal.functions.ts` — pure data shape
- Webhook signature verification in `src/routes/api/public/stripe-webhook.ts`

Server functions that call Supabase / Stripe are best covered by
integration tests against a disposable Supabase branch — out of scope
for this round.
