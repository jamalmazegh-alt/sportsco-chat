/**
 * 27 — Groupes internes du club (club_groups, club_group_members, club_group_rules)
 *
 * Seeds: club_id, created_by, name, description, is_active.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { loginViaUI, publicationAudienceLabel, tx, uniqueName } from "./_fixtures/ui";

let club: SeededClub;

test.beforeAll(async () => {
  club = await createTestClub("groups");
});
test.afterAll(async () => {
  await admin.from("club_groups").delete().eq("club_id", club.clubId).like("name", "grp-%");
  await club.cleanup();
});

test.describe("groupes du club", () => {
  test("admin crée un groupe et le voit listé", async ({ page }) => {
    const name = uniqueName("grp");

    await loginViaUI(page, "admin");
    await page.goto("/admin/groups");
    await expect(page.getByRole("heading", { name: tx("groups.title") })).toBeVisible();

    await page.getByRole("button", { name: tx("groups.create") }).click();

    await page.locator("#group-name").fill(name);
    await page.locator("#group-desc").fill("Groupe E2E");

    await page.getByRole("button", { name: tx("common.save") }).click();

    await expect(page.getByText(name)).toBeVisible();
  });

  test("admin ouvre la gestion des membres d'un groupe", async ({ page }) => {
    const name = uniqueName("grp");
    const groupId = await seedGroup(name);

    await loginViaUI(page, "admin");
    await page.goto("/admin/groups");
    await expect(page.getByRole("heading", { name: tx("groups.title") })).toBeVisible();

    await page
      .getByRole("button", { name: tx("groups.manageMembers") })
      .first()
      .click();

    await expect(page.getByText(name).first()).toBeVisible();
    expect(groupId).toBeTruthy();
  });

  test("un groupe désactivé n'est pas proposé comme audience de sondage", async ({ page }) => {
    const name = uniqueName("grp");
    await seedGroup(name, { isActive: false });

    await loginViaUI(page, "admin");
    await page.goto("/publications/new");

    await page.locator("#pub-title").fill(uniqueName("q"));
    const opts = page.getByPlaceholder(/Option\s*\d/i);
    await opts.nth(0).fill("A");
    await opts.nth(1).fill("B");
    await page.getByRole("button", { name: tx("common.next") }).click();

    await expect(publicationAudienceLabel(page)).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("le rôle coach n'accède pas à l'administration des groupes", async ({ page }) => {
    await loginViaUI(page, "coach");
    await page.goto("/admin/groups");

    await expect(page.getByRole("button", { name: tx("groups.create") })).toHaveCount(0);
  });
});

async function seedGroup(name: string, opts: { isActive?: boolean } = {}): Promise<string> {
  const { data, error } = await admin
    .from("club_groups")
    .insert({
      club_id: club.clubId,
      created_by: club.admin.userId,
      name,
      description: "seed E2E",
      is_active: opts.isActive ?? true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedGroup: ${error?.message}`);
  return data.id as string;
}
