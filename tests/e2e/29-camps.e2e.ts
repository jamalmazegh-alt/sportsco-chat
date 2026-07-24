/**
 * 29 — Stages / Camps (club_camps, …)
 *
 * Seeds: title (not name), slug, start_date/end_date, capacity, status.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { loginViaUI, tx, uniqueName } from "./_fixtures/ui";

let club: SeededClub;

test.beforeAll(async () => {
  club = await createTestClub("camps");
});
test.afterAll(async () => {
  await admin.from("club_camps").delete().eq("club_id", club.clubId).like("title", "camp-%");
  await club.cleanup();
});

test.describe("stages — administration", () => {
  test("admin ouvre la liste des stages", async ({ page }) => {
    await loginViaUI(page, "admin");
    await page.goto("/admin/camps");
    await expect(page).toHaveURL(/\/admin\/camps/);

    await expect(page.getByRole("heading", { name: tx("list.title", "camps") })).toBeVisible();
    await expect(page.getByRole("button", { name: tx("list.new", "camps") })).toBeVisible();
  });

  test("admin crée un stage", async ({ page }) => {
    const name = uniqueName("camp");
    const start = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 35 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    await loginViaUI(page, "admin");
    await page.goto("/admin/camps");
    await expect(page.getByRole("heading", { name: tx("list.title", "camps") })).toBeVisible();
    await page.getByRole("button", { name: tx("list.new", "camps") }).click();

    // Chooser: assistant vs classic — testids live on the classic form.
    await page.getByRole("button", { name: tx("chooser.classic", "camps") }).click();

    await page.getByTestId("camp-title-input").fill(name);
    const startInput = page.locator('input[type="date"]').nth(0);
    const endInput = page.locator('input[type="date"]').nth(1);
    await startInput.fill(start);
    await endInput.fill(end);
    await expect(startInput).toHaveValue(start);
    await expect(endInput).toHaveValue(end);
    const capacity = page.locator('input[type="number"]').first();
    await capacity.fill("20");

    const createBtn = page.getByRole("button", { name: tx("list.create", "camps") });
    await expect(createBtn).toBeEnabled({ timeout: 10_000 });
    await createBtn.click();
    await page.waitForURL(/\/admin\/camps\/[0-9a-f-]+/, { timeout: 20_000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
  });

  test("le filtre par statut restreint la liste", async ({ page }) => {
    const draft = uniqueName("camp");
    await seedCamp(draft, "draft");
    const published = uniqueName("camp");
    await seedCamp(published, "published");

    await loginViaUI(page, "admin");
    await page.goto("/admin/camps");
    await expect(page.getByRole("heading", { name: tx("list.title", "camps") })).toBeVisible();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: tx("status.published", "camps") }).click();

    await expect(page.getByText(published)).toBeVisible();
    await expect(page.getByText(draft)).toHaveCount(0);
  });
});

test.describe("stages — page publique", () => {
  test("un stage publié est accessible sans être connecté", async ({ page }) => {
    const name = uniqueName("camp");
    const slug = `e2e-${club.runId}`;
    await seedCamp(name, "published", slug);

    const clubSlug = process.env.E2E_CLUB_SLUG;
    test.skip(!clubSlug, "E2E_CLUB_SLUG requis pour tester la page publique des stages.");

    await page.goto(`/stages/${clubSlug}/${slug}`);
    await expect(page.getByText(name)).toBeVisible();
  });

  test("un stage en brouillon n'est PAS accessible publiquement", async ({ page }) => {
    const name = uniqueName("camp");
    const slug = `e2e-draft-${club.runId}`;
    await seedCamp(name, "draft", slug);

    const clubSlug = process.env.E2E_CLUB_SLUG;
    test.skip(!clubSlug, "E2E_CLUB_SLUG requis.");

    await page.goto(`/stages/${clubSlug}/${slug}`);
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("le formulaire d'inscription publique s'affiche", async ({ page }) => {
    const clubSlug = process.env.E2E_CLUB_SLUG;
    const campSlug = process.env.E2E_CAMP_SLUG;
    test.skip(!clubSlug || !campSlug, "E2E_CLUB_SLUG + E2E_CAMP_SLUG requis.");

    await page.goto(`/stages/${clubSlug}/${campSlug}/inscription`);
    await expect(page.locator("form")).toBeVisible();
  });
});

async function seedCamp(
  title: string,
  status: "draft" | "published" | "closed" | "archived",
  slug?: string,
): Promise<string> {
  const start = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const end = new Date(Date.now() + 35 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from("club_camps")
    .insert({
      club_id: club.clubId,
      title,
      slug: slug ?? `e2e-${Math.random().toString(36).slice(2, 8)}`,
      status,
      start_date: start,
      end_date: end,
      capacity: 20,
      created_by: club.admin.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedCamp: ${error?.message}`);
  return data.id as string;
}
