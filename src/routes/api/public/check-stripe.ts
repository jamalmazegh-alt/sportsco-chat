import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/check-stripe')({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.STRIPE_SECRET_KEY
        if (!key) return new Response(JSON.stringify({ ok: false, error: 'no key' }), { status: 200 })
        const r = await fetch('https://api.stripe.com/v1/account', {
          headers: { Authorization: `Bearer ${key}` },
        })
        const body = await r.text()
        return new Response(
          JSON.stringify({
            ok: r.ok,
            status: r.status,
            keyPrefix: key.slice(0, 8),
            keyLength: key.length,
            body: r.ok ? JSON.parse(body) : body.slice(0, 300),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
