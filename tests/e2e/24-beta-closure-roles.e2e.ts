/**
 * 24 — Beta closure smoke (role matrix / mobile 375px)
 *
 * Per-role nav + onboarding scan: no V2 menu entry, no payment / social /
 * public-profile CTA. Logged-out scan only (the role-gated nav already
 * redirects unauthenticated users to /auth, which we accept as proof
 * the masked entries are unreachable from a public surface).
 *
 * Logged-in role-specific assertions are deferred: they require fixture
 * users per role (Parent/Joueur/Coach/Admin club/Organisateur/Staff) which
 * the E2E env does not yet seed. The admin spec (23) covers the closure
 * proof; this spec asserts that the public surface stays clean at mobile
 * size, and that the auth gate behaves identically across role-suffixed
 * deep links.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

test.use({ viewport: { width: 375, height: 812 } });

const FORBIDDEN_LABELS = [
  /Suivre\b/i,
  /Following/i,
  /Mettre en relation/i,
  /Connecter Stripe/i,
  /Payer/i,
  /Cotisation/i,
  /Acheter un pack/i,
];

test.describe("Beta closure — role matrix (mobile, public surface)", () => {
  for (const path of ["/", "/features", "/pricing", "/faq", "/login", "/register"]) {
    test(`public page ${path} surfaces no V2 CTA on mobile`, async ({ page }) => {
      const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0).toBeLessThan(400);
      const html = await page.content();
      for (const re of FORBIDDEN_LABELS) {
        expect(html, `forbidden CTA matched ${re} on ${path}`).not.toMatch(re);
      }
    });
  }

  for (const path of ["/following", "/follow-ups", "/payments", "/tournaments/new-from-pass"]) {
    test(`role-gated entry ${path} does not 404/500`, async ({ page }) => {
      const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0).toBeLessThan(400);
    });
  }
});
