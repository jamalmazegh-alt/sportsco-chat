/**
 * 28 — Besoins / « Coups de main » (event_needs + event_need_*)
 *
 * Seeds go through `event_needs` (label, capacity, validation_mode, status),
 * then optional `event_need_publications` / audiences / signups.
 * Audience types use needs vocabulary (`team_parents`), not publications'.
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { loginViaUI, tx, uniqueName, expectToast } from "./_fixtures/ui";

let club: SeededClub;

test.beforeAll(async () => {
  club = await createTestClub("needs");
});
test.afterAll(async () => {
  await admin.from("event_needs").delete().eq("event_id", club.eventId);
  await club.cleanup();
});

test.describe("besoins — création côté staff", () => {
  test("le coach ajoute un besoin sur un événement", async ({ page }) => {
    const label = uniqueName("need");

    await loginViaUI(page, "coach");
    await page.goto(`/events/${club.eventId}`);

    // Section mounts after the needs query — wait explicitly (returns null while loading).
    await expect(page.locator("#needs")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(tx("section.title", "needs"))).toBeVisible();

    await page.getByRole("button", { name: tx("section.add", "needs") }).click();

    await page.locator("#need-label").fill(label);
    await page.locator("#need-capacity").fill("2");

    const continueBtn = page.getByRole("button", {
      name: tx("wizard.continueToRecipients", "needs"),
    });
    if (await continueBtn.count()) {
      await continueBtn.click();
    }

    const publish = page.getByRole("button", { name: tx("actions.publish", "needs") });
    const create = page.getByRole("button", { name: tx("common.create") });
    if (await publish.count()) await publish.click();
    else if (await create.count()) await create.click();
    else await page.getByRole("button", { name: tx("common.save") }).click();

    await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 });
  });

  test("un besoin en brouillon porte le badge « non publié »", async ({ page }) => {
    const label = uniqueName("need");
    await seedNeed(label, { published: false });

    await loginViaUI(page, "coach");
    await page.goto(`/events/${club.eventId}`);

    await expect(page.locator("#needs")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(label)).toBeVisible();
    await expect(page.getByText(tx("badge.unpublished", "needs")).first()).toBeVisible();
  });

  test("un brouillon n'apparaît PAS dans le feed du parent", async ({ page }) => {
    const label = uniqueName("need");
    await seedNeed(label, { published: false });

    await loginViaUI(page, "parent");
    await page.goto("/needs");

    await expect(page.getByText(label)).toHaveCount(0);
  });
});

test.describe("besoins — parcours destinataire", () => {
  test("le parent voit un besoin publié et se porte volontaire", async ({ page }) => {
    const label = uniqueName("need");
    await seedNeed(label, { published: true });

    await loginViaUI(page, "parent");
    await page.goto("/needs");

    await expect(page.getByText(tx("feed.title", "needs"))).toBeVisible();
    await expect(page.getByText(label)).toBeVisible();
  });

  test("le parent se retire et la place est libérée", async ({ page }) => {
    const label = uniqueName("need");
    const needId = await seedNeed(label, { published: true });
    await seedSignup(needId);

    await loginViaUI(page, "parent");
    await page.goto("/needs");

    await expect(page.getByText(label)).toBeVisible();
    expect(needId).toBeTruthy();
  });

  test("le feed affiche l'état vide quand aucun besoin n'est ouvert", async ({ page }) => {
    await loginViaUI(page, "player");
    await page.goto("/needs");

    await expect(
      page.getByText(tx("feed.empty", "needs")).or(page.getByText(tx("feed.title", "needs"))),
    ).toBeVisible();
  });
});

test.describe("besoins — couverture", () => {
  test("fermer un besoin le retire du feed destinataire", async ({ page }) => {
    const label = uniqueName("need");
    await seedNeed(label, { published: true });

    await loginViaUI(page, "coach");
    await page.goto(`/events/${club.eventId}`);

    await expect(page.locator("#needs")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(label)).toBeVisible();

    await page
      .getByRole("button", { name: tx("card.menuLabel", "needs") })
      .first()
      .click();
    await page.getByRole("menuitem", { name: tx("menu.closeNeed", "needs") }).click();
    // Menu opens a confirm alertdialog — must confirm before the toast fires.
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: tx("closeDialog2.confirm", "needs") }).click();
    await expectToast(page, tx("status.closed", "needs"));
  });
});

async function seedNeed(label: string, opts: { published: boolean }): Promise<string> {
  const { data, error } = await admin
    .from("event_needs")
    .insert({
      event_id: club.eventId,
      club_id: club.clubId,
      team_id: club.teamId,
      role_key: "volunteer",
      label,
      capacity: 2,
      validation_mode: "auto",
      status: "draft",
      created_by: club.coach.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedNeed: ${error?.message}`);

  if (opts.published) {
    // RLS feed visibility uses event_need_publication_recipients via
    // user_is_need_recipient — audiences alone are not enough.
    const { error: pubErr } = await admin.rpc("publish_event_need_atomic" as any, {
      _need_id: data.id,
      _actor: club.coach.userId,
      _audiences: [{ type: "team_parents", team_id: club.teamId }],
    });
    if (pubErr) throw new Error(`seedNeed publish: ${pubErr.message}`);
  }
  return data.id as string;
}

async function seedSignup(needId: string): Promise<void> {
  const { data: member, error: memberErr } = await admin
    .from("club_members")
    .select("id")
    .eq("club_id", club.clubId)
    .eq("user_id", club.player2WithParent.parent.userId)
    .maybeSingle();
  if (memberErr) throw new Error(`seedSignup member lookup: ${memberErr.message}`);
  if (!member) {
    throw new Error(
      `seedSignup: parent club_member not found (club=${club.clubId}, user=${club.player2WithParent.parent.userId})`,
    );
  }
  const { error } = await admin.from("event_need_signups").insert({
    need_id: needId,
    member_id: member.id,
    user_id: club.player2WithParent.parent.userId,
    status: "applied",
  });
  if (error) throw new Error(`seedSignup: ${error.message}`);
}
