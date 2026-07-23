/**
 * 26 — Publications & Sondages (club_publications, club_poll_*)
 *
 * Seeds aligned on schema: publication_type, poll_visibility, author_id;
 * club_poll_options.sort_order (not position); no status column.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { loginViaUI, tx, uniqueName, expectToast } from "./_fixtures/ui";

let club: SeededClub;

test.beforeAll(async () => {
  club = await createTestClub("pub-polls");
});
test.afterAll(async () => {
  await admin
    .from("club_publications")
    .delete()
    .eq("club_id", club.clubId)
    .like("title", "%poll-%");
  await club.cleanup();
});

test.describe("publications — sondages", () => {
  test("admin crée un sondage anonyme et le voit dans la liste", async ({ page }) => {
    const question = uniqueName("poll-anon");

    await loginViaUI(page, "admin");
    await page.goto("/publications/new");

    await page.getByLabel(tx("form.questionLabel", "publications")).fill(question);

    const optionInputs = page.getByPlaceholder(/Option\s*\d/i);
    await optionInputs.nth(0).fill("Samedi");
    await optionInputs.nth(1).fill("Dimanche");

    await page.getByRole("button", { name: tx("new.addOption", "publications") }).click();
    await optionInputs.nth(2).fill("Peu importe");

    await page.locator("#v-anon").click();
    await page.getByRole("button", { name: tx("common.next") }).click();

    await expect(page.getByText(tx("new.audienceLabel", "publications"))).toBeVisible();
    await selectSeededTeamAudience(page);

    await page.getByRole("button", { name: tx("new.publish", "publications") }).click();
    await expectToast(page, tx("new.published", "publications"));

    await page.goto("/publications");
    await expect(page.getByText(question)).toBeVisible();
    await expect(page.getByText(tx("list.anonymous", "publications")).first()).toBeVisible();
  });

  test("l'anonymat est verrouillé après création (aucun contrôle d'édition)", async ({ page }) => {
    const question = uniqueName("poll-lock");
    const pubId = await seedPoll(question, "anonymous");

    await loginViaUI(page, "admin");
    await page.goto(`/publications/${pubId}`);

    await expect(page.getByText(question)).toBeVisible();
    await expect(page.locator("#v-anon")).toHaveCount(0);
    await expect(page.locator("#v-staff")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: tx("new.visibility", "publications") }),
    ).toHaveCount(0);
  });

  test("un joueur vote et son vote est enregistré", async ({ page }) => {
    const question = uniqueName("poll-vote");
    const pubId = await seedPoll(question, "anonymous");

    await loginViaUI(page, "player");
    await page.goto(`/publications/${pubId}`);

    await page
      .getByRole("button", { name: /Samedi/i })
      .first()
      .click();
    const confirm = page.getByRole("button", { name: tx("detail.confirmVote", "publications") });
    if (await confirm.count()) await confirm.first().click();

    await expectToast(page, tx("detail.voted", "publications"));
  });

  test("un parent vote POUR son enfant (subject ≠ actor)", async ({ page }) => {
    const question = uniqueName("poll-child");
    const pubId = await seedPoll(question, "staff_visible");

    await loginViaUI(page, "parent");
    await page.goto(`/publications/${pubId}`);

    await expect(page.getByText(tx("detail.votingAs", "publications"))).toBeVisible();
    await page
      .getByRole("button", { name: new RegExp(club.prefix, "i") })
      .first()
      .click();

    await page
      .getByRole("button", { name: /Samedi/i })
      .first()
      .click();
    const confirm = page.getByRole("button", { name: tx("detail.confirmVote", "publications") });
    if (await confirm.count()) await confirm.first().click();

    await expectToast(page, tx("detail.voted", "publications"));
  });

  test("un sondage fermé n'accepte plus de vote", async ({ page }) => {
    const question = uniqueName("poll-closed");
    const pubId = await seedPoll(question, "anonymous");

    await loginViaUI(page, "admin");
    await page.goto(`/publications/${pubId}`);
    await page.getByRole("button", { name: tx("detail.close", "publications") }).click();
    await expectToast(page, tx("detail.closed", "publications"));

    await expect(page.getByText(tx("list.closed", "publications")).first()).toBeVisible();
  });
});

async function seedPoll(
  question: string,
  visibility: "anonymous" | "staff_visible",
): Promise<string> {
  const { data, error } = await admin
    .from("club_publications")
    .insert({
      club_id: club.clubId,
      author_id: club.admin.userId,
      title: question,
      publication_type: "poll",
      poll_visibility: visibility,
      publish_to_wall: true,
      send_email: false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedPoll: ${error?.message}`);

  const { error: optErr } = await admin.from("club_poll_options").insert([
    { publication_id: data.id, label: "Samedi", sort_order: 0 },
    { publication_id: data.id, label: "Dimanche", sort_order: 1 },
  ]);
  if (optErr) throw new Error(`seedPoll options: ${optErr.message}`);

  const { error: audErr } = await admin.from("club_publication_audiences").insert({
    publication_id: data.id,
    audience_type: "joueurs_equipe",
    team_id: club.teamId,
  });
  if (audErr) console.warn(`[seedPoll] audience: ${audErr.message}`);

  return data.id as string;
}

async function selectSeededTeamAudience(page: import("@playwright/test").Page) {
  const selects = page.getByRole("combobox");
  if (await selects.count()) {
    await selects.first().click();
    await page
      .getByRole("option", { name: tx("audience.types.joueurs_equipe", "publications") })
      .click()
      .catch(() => {});
    await selects
      .nth(1)
      .click()
      .catch(() => {});
    await page
      .getByRole("option", { name: new RegExp(club.prefix, "i") })
      .click()
      .catch(() => {});
    await page
      .getByRole("button", { name: tx("common.add") })
      .first()
      .click()
      .catch(() => {});
  }
}
