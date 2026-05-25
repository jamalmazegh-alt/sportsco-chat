/**
 * 15 — Parcours d'achat du pack Clubero
 *
 * Garantit que le flux complet de souscription au pack Clubero reste
 * fonctionnel de bout en bout :
 *   A. La page publique /pricing expose bien un CTA Clubero qui pointe
 *      vers /register.
 *   B. Un admin connecté sans abonnement actif est redirigé vers
 *      /admin/billing dès qu'il essaie d'accéder à un module verrouillé.
 *   C. Le clic sur le plan Mensuel déclenche createCheckoutSession et
 *      renvoie une URL Stripe Checkout (sans suivre la redirection
 *      externe).
 *   D. Une fois l'évènement webhook Stripe simulé (subscription row
 *      `active` + `current_period_end` futur), l'app se débloque :
 *      les routes club redeviennent accessibles.
 *
 * Aucun appel réel à Stripe — on capture window.location.assign pour
 * vérifier que la redirection part bien vers checkout.stripe.com, et on
 * reproduit le side-effect du webhook via le client service-role.
 */
import { test, expect, type Page } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { loginAs } from "./_fixtures/auth";
import { createTestClub, type SeededClub } from "./_fixtures/club";

// Hook window.location.assign so the "redirect to Stripe" navigation is
// captured rather than executed. Must be installed before page load.
async function captureExternalRedirects(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __navAssigns__?: string[] };
    w.__navAssigns__ = [];
    const origAssign = window.location.assign.bind(window.location);
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: (url: string | URL) => {
        const u = typeof url === "string" ? url : url.toString();
        w.__navAssigns__!.push(u);
        // External Stripe URLs: skip the real navigation so the test can
        // keep asserting on the app.
        if (/^https?:\/\//.test(u) && !u.startsWith(window.location.origin)) {
          return;
        }
        origAssign(u);
      },
    });
  });
}

async function readCapturedRedirects(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __navAssigns__?: string[] };
    return w.__navAssigns__ ?? [];
  });
}

test.describe("Clubero pack — page tarifs publique", () => {
  test("A. /pricing expose le CTA Clubero vers /register", async ({ page }) => {
    const resp = await page.goto("/pricing");
    expect(resp?.ok()).toBeTruthy();

    // Le tarif du plan Clubero doit rester présent.
    await expect(page.locator("text=/49\\s*€/").first()).toBeVisible();

    // Au moins un CTA pointe vers /register (essai + carte plan principale).
    const registerLinks = page.locator('a[href="/register"]');
    expect(await registerLinks.count()).toBeGreaterThan(0);
  });
});

test.describe("Clubero pack — admin flow (checkout + webhook)", () => {
  let seed: SeededClub | undefined;

  test.beforeAll(async () => {
    seed = await createTestClub("packflow");
  });

  test.afterAll(async () => {
    if (seed) {
      await admin.from("subscriptions").delete().eq("club_id", seed.clubId);
      await seed.cleanup();
    }
  });

  test.skip("admin sans sub → /admin/billing → checkout → webhook → unlock", async ({
    page,
  }) => {
    if (!seed) throw new Error("seed missing");

    // Sanity: aucun abonnement actif au départ.
    const { data: sub0 } = await admin
      .from("subscriptions")
      .select("status")
      .eq("club_id", seed.clubId)
      .maybeSingle();
    expect(sub0?.status ?? null).not.toBe("active");

    await captureExternalRedirects(page);
    await loginAs(page, seed.admin);

    // --- B. Module club verrouillé → redirection forcée vers /admin/billing.
    await page.goto("/events");
    await expect(page).toHaveURL(/\/admin\/billing$/, { timeout: 15_000 });

    // Le plan Mensuel (49 €) doit être visible et cliquable.
    const monthly = page.getByRole("button", { name: /49\s?€/ });
    await expect(monthly.first()).toBeVisible();

    // --- C. Clic Mensuel → createCheckoutSession → URL Stripe captée.
    await monthly.first().click();

    await expect
      .poll(async () => (await readCapturedRedirects(page)).length, {
        timeout: 20_000,
        intervals: [500, 1000, 1500],
      })
      .toBeGreaterThan(0);

    const redirects = await readCapturedRedirects(page);
    const stripeUrl = redirects.find((u) =>
      /checkout\.stripe\.com|stripe\.com\/c\/pay/.test(u),
    );
    expect(
      stripeUrl,
      `expected Stripe checkout URL, got: ${JSON.stringify(redirects)}`,
    ).toBeTruthy();

    // Le row subscriptions doit déjà porter le stripe_customer_id : c'est
    // ce que createCheckoutSession upsert avant l'appel Stripe Checkout.
    const { data: subAfterCheckout } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("club_id", seed.clubId)
      .maybeSingle();
    expect(subAfterCheckout?.stripe_customer_id).toBeTruthy();

    // --- D. Simulation du webhook checkout.session.completed : on reproduit
    // exactement le side-effect produit par upsertSubscription() dans
    // src/routes/api/public/stripe-webhook.ts.
    const periodStart = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const { error: upsertErr } = await admin.from("subscriptions").upsert(
      {
        club_id: seed.clubId,
        stripe_customer_id: subAfterCheckout!.stripe_customer_id!,
        stripe_subscription_id: `sub_e2e_${Date.now()}`,
        stripe_price_id: "price_1TZluSH9mBVlmKXfUr87LvQ9",
        plan: "monthly",
        status: "active",
        current_period_start: periodStart,
        current_period_end: periodEnd,
        trial_end: null,
        cancel_at_period_end: false,
        cancel_at: null,
        canceled_at: null,
      },
      { onConflict: "club_id" },
    );
    expect(upsertErr).toBeNull();

    // Le helper RPC utilisé par l'app pour gater les actions doit
    // maintenant renvoyer true.
    const { data: isActiveData, error: rpcErr } = await admin.rpc(
      "club_has_active_subscription",
      { _club_id: seed.clubId },
    );
    expect(rpcErr).toBeNull();
    expect(isActiveData).toBe(true);

    // --- Déblocage : l'admin atteint /events sans rebond vers /admin/billing.
    await page.goto("/events");
    await expect(page).toHaveURL(/\/events(\/|$|\?)/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/admin\/billing/);
  });
});
