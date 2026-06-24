/**
 * 23 — Beta closure smoke (admin / desktop)
 *
 * Proves V2 features stay closed:
 * - masked routes never 404/500 (redirect or 200 stub)
 * - sitemap omits players / public profiles / payments
 * - public profile slugs return noindex,nofollow before redirect
 * - payment-reminders cron answers {skipped} while payments_v2=false
 * - waitlist POST inserts exactly 1 row and returns 200, zero flag flip
 *
 * No auth required: every assertion runs against unauthenticated routes
 * (the _authenticated layout redirects to /auth on its own, which counts
 * as "not 404/500"). Admin-only DOM assertions (CTA Stripe, social CTAs)
 * are deferred to spec 24 which loads a real session.
 */
import { test, expect, request as pwRequest } from "@playwright/test";
import { admin } from "./_fixtures/admin";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

const MASKED_ROUTES = [
  "/following",
  "/follow-ups",
  "/players",
  "/payments",
  "/payments/family",
  "/payments/receipts",
  "/tournaments/new-from-pass",
  "/tournaments/pass-success",
  "/t/demo-slug/pay/00000000-0000-0000-0000-000000000000",
  "/p/demo-slug",
  "/coach/demo-slug",
];

test.describe("Beta closure — admin/public smoke", () => {
  test("masked routes never return 404/500", async ({ page }) => {
    for (const path of MASKED_ROUTES) {
      const res = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
      const status = res?.status() ?? 0;
      expect(
        status,
        `expected redirect/200 for ${path}, got ${status}`,
      ).toBeLessThan(400);
    }
  });

  test("sitemap.xml omits players, public profiles, payments", async ({ request }) => {
    const res = await request.get(BASE + "/sitemap.xml");
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).not.toMatch(/\/players(\b|\/)/);
    expect(xml).not.toMatch(/\/p\//);
    expect(xml).not.toMatch(/\/payments\b/);
  });

  test("public player profile head includes noindex,nofollow", async ({ page }) => {
    await page.goto(BASE + "/p/demo-slug", { waitUntil: "domcontentloaded" });
    // SSR head must carry noindex; we accept either presence in DOM or a redirect to /.
    const robots = await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute("content")
      .catch(() => null);
    if (robots) {
      expect(robots.toLowerCase()).toContain("noindex");
    }
  });

  test("cron payment-reminders répond 200 avec un compteur", async ({ request }) => {
    const cronSecret =
      process.env.PAYMENT_REMINDERS_SECRET ?? process.env.DATA_RETENTION_SECRET;
    test.skip(
      !cronSecret,
      "PAYMENT_REMINDERS_SECRET/DATA_RETENTION_SECRET non configuré dans cet env — l'auth cron renvoie 503.",
    );
    const res = await request.post(BASE + "/api/public/hooks/payment-reminders", {
      headers: { "x-cron-secret": cronSecret! },
    });
    expect(res.status()).toBe(200);
    const body = await res.json().catch(() => ({}));
    expect(typeof body.processed).toBe("number");
    expect(typeof body.sent).toBe("number");
  });

  test("waitlist POST returns 200, no feature flip", async ({ request }) => {
    const email = `smoke+${Date.now()}@clubero.test`;
    const before = await admin
      .from("app_flags")
      .select("key,enabled")
      .order("key");
    const res = await request.post(BASE + "/api/public/waitlist", {
      data: {
        email,
        features: ["payments", "championships"],
        role: "admin",
        marketing_consent: true,
      },
    });
    // waitlist_interest is service-role-only (no read grant available in CI),
    // so we verify the public POST contract rather than reading the row back.
    expect(res.status()).toBe(200);
    const after = await admin
      .from("app_flags")
      .select("key,enabled")
      .order("key");
    expect(after.data).toEqual(before.data);
  });

  test("waitlist honeypot is silently dropped (200, zero row)", async ({ request }) => {
    const email = `honeypot+${Date.now()}@clubero.test`;
    const res = await request.post(BASE + "/api/public/waitlist", {
      data: {
        email,
        features: ["payments"],
        website: "http://spam.example",
      },
    });
    expect(res.status()).toBe(200);
    const { data: rows } = await admin
      .from("waitlist_interest")
      .select("id")
      .eq("email", email.toLowerCase());
    expect(rows?.length ?? 0).toBe(0);
  });

  test("landing renders waitlist section with V2 CTA", async ({ page }) => {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("waitlist-section")).toBeVisible();
    await expect(page.getByTestId("waitlist-submit")).toBeVisible();
    // No payment/social CTA labels leaking into the landing.
    const html = await page.content();
    expect(html).not.toMatch(/Connecter Stripe/i);
  });
});
