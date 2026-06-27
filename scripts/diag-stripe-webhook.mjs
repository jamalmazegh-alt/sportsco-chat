#!/usr/bin/env node
/**
 * Quick probe: Stripe webhooks must hit the apex URL directly.
 * Stripe does NOT follow 3xx redirects — www → apex breaks all deliveries.
 *
 * Usage:
 *   node scripts/diag-stripe-webhook.mjs
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/diag-stripe-webhook.mjs
 */
const APEX = "https://clubero.app/api/public/stripe-webhook";
const WWW = "https://www.clubero.app/api/public/stripe-webhook";

async function probe(url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const body = (await res.text()).slice(0, 120);
  return { url, status: res.status, body };
}

const results = await Promise.all([probe(WWW), probe(APEX)]);
console.log("Stripe webhook reachability (unsigned POST — expect 400, never 3xx):\n");
for (const r of results) {
  const ok = r.status >= 200 && r.status < 300;
  const redirect = r.status >= 300 && r.status < 400;
  const flag = redirect
    ? "FAIL (redirect — Stripe will not deliver)"
    : ok
      ? "OK"
      : "OK (handler reached)";
  console.log(`${flag}  ${r.status}  ${r.url}`);
  console.log(`       ${r.body}\n`);
}

const key = process.env.STRIPE_SECRET_KEY;
if (key) {
  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch("https://api.stripe.com/v1/webhook_endpoints?limit=10", {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  if (data.error) {
    console.error("Stripe API:", data.error.message);
    process.exit(1);
  }
  console.log("Registered Stripe webhook endpoints:");
  for (const w of data.data ?? []) {
    const bad = w.url.includes("://www.");
    console.log(`  ${bad ? "⚠️  www (fix me)" : "✅"} ${w.url}  [${w.status}]`);
  }
}
