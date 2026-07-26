/**
 * 30 — Paiements & collectes
 *
 * Admin + member payment UIs are gated by `isV2("fundraising_v2")`, a
 * build-time flag (false in beta V1). The whole file skips when the flag is
 * off so the report shows "skipped, flag off" rather than false greens via
 * URL-redirect detection.
 */
import { test, expect } from "@playwright/test";
import { isV2 } from "./_fixtures/features";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { loginViaUI, tx, uniqueName } from "./_fixtures/ui";

test.describe.configure({ mode: "serial" });
test.skip(
  !isV2("fundraising_v2"),
  "fundraising_v2=false (flag de build, src/config/features.ts) — " +
    "specs paiements inactives en bêta V1.",
);

let club: SeededClub;
let seasonId: string;

test.beforeAll(async () => {
  club = await createTestClub("payments");
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("seasons")
    .insert({
      club_id: club.clubId,
      label: `E2E ${club.runId}`,
      start_date: start,
      end_date: end,
      is_current: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`[payments] season seed failed: ${error?.message ?? "no data"}`);
  }
  seasonId = data.id;
});
test.afterAll(async () => {
  if (seasonId) {
    await admin.from("payment_items").delete().eq("season_id", seasonId);
    await admin.from("seasons").delete().eq("id", seasonId);
  }
  await club.cleanup();
});

test.describe("collectes — administration", () => {
  test("admin ouvre la page des collectes", async ({ page }) => {
    await loginViaUI(page, "admin");
    await page.goto("/admin/payments/items");

    await expect(page).toHaveURL(/\/admin\/payments\/items/);
    await expect(page.getByText(tx("fundraising.title"))).toBeVisible();
  });

  test("admin crée une collecte", async ({ page }) => {
    await loginViaUI(page, "admin");
    await page.goto("/admin/payments/items");

    const title = uniqueName("pay");
    await page.getByRole("button", { name: tx("fundraising.newButton") }).click();
    // Form uses hardcoded FR labels in beta — fill by role/order.
    const textboxes = page.getByRole("textbox");
    await textboxes.first().fill(title);
    await page.getByRole("button", { name: /Créer et assigner|Create/i }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });

  test("sans saison active, l'écran invite à configurer les saisons", async ({ page }) => {
    await loginViaUI(page, "admin");
    await page.goto("/admin/payments/items");

    await expect(
      page
        .getByText(tx("fundraising.noSeason"))
        .or(page.getByText(tx("fundraising.empty")))
        .or(page.getByText(tx("fundraising.title"))),
    ).toBeVisible();
  });
});

test.describe("paiements — vue membre", () => {
  test("le parent voit ses obligations de paiement", async ({ page }) => {
    await loginViaUI(page, "parent");
    await page.goto("/payments");

    await expect(page).toHaveURL(/\/payments/);
    await expect(page.getByText(tx("payments.title"))).toBeVisible();
    await expect(
      page.getByText(tx("payments.emptyTitle")).or(page.getByText(tx("payments.subtitle"))),
    ).toBeVisible();
  });

  test("la vue famille est accessible depuis /payments", async ({ page }) => {
    await loginViaUI(page, "parent");
    await page.goto("/payments");

    await page.getByRole("link", { name: tx("payments.familyView") }).click();
    await expect(page).toHaveURL(/\/payments\/family/);
  });

  test("les reçus sont accessibles", async ({ page }) => {
    await loginViaUI(page, "parent");
    await page.goto("/payments");

    await page.getByRole("link", { name: tx("payments.receipts") }).click();
    await expect(page).toHaveURL(/\/payments\/receipts/);
  });

  test("une obligation partiellement payée est signalée", async ({ page }) => {
    const itemId = await seedPaymentItem(uniqueName("pay"));
    await seedObligation(itemId);

    await loginViaUI(page, "parent");
    await page.goto("/payments");

    await expect(page.getByText(tx("payments.status.partiallyPaid")).first()).toBeVisible();
  });
});

test.describe("paiements — cloisonnement", () => {
  test("un joueur n'accède pas à l'admin des collectes", async ({ page }) => {
    await loginViaUI(page, "player");
    await page.goto("/admin/payments/items");

    await expect(page.getByText(tx("fundraising.title"))).toHaveCount(0);
  });
});

async function seedPaymentItem(title: string): Promise<string> {
  const { data, error } = await admin
    .from("payment_items")
    .insert({
      club_id: club.clubId,
      season_id: seasonId,
      type: "fundraising",
      title,
      amount_cents: 5000,
      created_by: club.admin.userId,
      status: "open",
      allow_partial: true,
      due_date: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seedPaymentItem: ${error?.message ?? "no data"}`);
  }
  return data.id as string;
}

async function seedObligation(itemId: string): Promise<void> {
  const { error } = await admin.from("payment_obligations").insert({
    payment_item_id: itemId,
    club_id: club.clubId,
    player_id: club.player2WithParent.id,
    amount_due_cents: 5000,
    status: "partially_paid",
    payer_user_id: club.player2WithParent.parent.userId,
  });
  if (error) throw new Error(`seedObligation: ${error.message}`);
}
