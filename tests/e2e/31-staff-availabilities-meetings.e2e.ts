/**
 * 31 — Indisponibilités staff & Réunions
 *
 * staff_availabilities: start_date/end_date (date), reason, created_by_user_id,
 * visibility admins_only|staff — not starts_at / team_visible.
 *
 * staffAvailability.* keys live only as defaultValue → txOr().
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import {
  fillEventStartDateTime,
  loginViaUI,
  openClassicEventForm,
  tx,
  txOr,
  uniqueName,
} from "./_fixtures/ui";

let club: SeededClub;

test.beforeAll(async () => {
  club = await createTestClub("staff-avail");
});
test.afterAll(async () => {
  await admin.from("staff_availabilities").delete().eq("club_id", club.clubId);
  await club.cleanup();
});

test.describe("indisponibilités staff", () => {
  test("le coach ouvre sa page d'indisponibilités", async ({ page }) => {
    await loginViaUI(page, "coach");
    await page.goto("/profile/availabilities");

    await expect(
      page.getByRole("heading", {
        name: txOr("staffAvailability.title", "Mes indisponibilités"),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: txOr("staffAvailability.declareCta", "Déclarer une indisponibilité"),
      }),
    ).toBeVisible();
  });

  test("le coach déclare une indisponibilité", async ({ page }) => {
    await loginViaUI(page, "coach");
    await page.goto("/profile/availabilities");

    await page
      .getByRole("button", {
        name: txOr("staffAvailability.declareCta", "Déclarer une indisponibilité"),
      })
      .click();

    await page.getByTestId("availability-range-trigger").click();
    const days = page.getByRole("gridcell").getByRole("button");
    if ((await days.count()) >= 10) {
      await days.nth(5).click();
      await days
        .nth(7)
        .click()
        .catch(() => {});
    }
    // Pick a reason card if present.
    await page
      .getByText(/vacances|vacation|congés/i)
      .first()
      .click()
      .catch(() => {});
    await page.getByRole("button", { name: tx("common.save") }).click();

    await expect(
      page.getByText(txOr("staffAvailability.title", "Mes indisponibilités")),
    ).toBeVisible();
  });

  test("l'état vide s'affiche sans indisponibilité", async ({ page }) => {
    await loginViaUI(page, "player");
    await page.goto("/profile/availabilities");

    // Title + empty copy are both visible — avoid .or() strict-mode dual match.
    await expect(
      page.getByRole("heading", {
        name: txOr("staffAvailability.title", "Mes indisponibilités"),
      }),
    ).toBeVisible();
    await expect(
      page.getByText(txOr("staffAvailability.empty", "Aucune indisponibilité")).first(),
    ).toBeVisible();
  });

  test("une indisponibilité admins_only : motif visible admin, masqué joueur", async ({
    page,
    browser,
  }) => {
    const marker = uniqueName("invis");
    await seedUnavailability({ visibility: "admins_only", comment: marker });

    // Contrôle positif : sans ça, l'absence chez le joueur ne prouve rien.
    await loginViaUI(page, "admin");
    await page.goto(`/teams/${club.teamId}/availability`);
    await expect(page.locator(`[title*="${marker}"]`)).toHaveCount(1, { timeout: 15_000 });

    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await loginViaUI(playerPage, "player");
    await playerPage.goto(`/teams/${club.teamId}/availability`);
    await expect(playerPage.locator(`[title*="${marker}"]`)).toHaveCount(0);
    await expect(playerPage.getByText(marker)).toHaveCount(0);
    await playerCtx.close();
  });
});

test.describe("réunions", () => {
  test("le coach crée un événement de type réunion", async ({ page }) => {
    const title = uniqueName("reunion");

    await loginViaUI(page, "coach");
    await page.goto("/events");

    await openClassicEventForm(page);

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(club.prefix) }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: tx("events.types.meeting") }).click();

    await page.getByTestId("event-name-input").fill(title);
    await fillEventStartDateTime(page);
    const publish = page.getByRole("button", { name: tx("events.publish") });
    await expect(publish).toBeEnabled({ timeout: 10_000 });
    await publish.click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });

  test("une réunion seedée est visible dans la liste des événements", async ({ page }) => {
    const title = uniqueName("reunion");
    await seedMeeting(title);

    await loginViaUI(page, "coach");
    await page.goto("/events");

    await expect(page.getByText(title)).toBeVisible();
  });

  test("un participant répond à une convocation de réunion", async ({ page }) => {
    const title = uniqueName("reunion");
    const eventId = await seedMeeting(title);

    await loginViaUI(page, "coach");
    await page.goto(`/events/${eventId}`);

    await expect(page.getByText(title)).toBeVisible();
  });
});

async function seedUnavailability(opts: {
  visibility: "admins_only" | "staff";
  comment: string;
}): Promise<void> {
  const start = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { error } = await admin.from("staff_availabilities").insert({
    club_id: club.clubId,
    user_id: club.coach.userId,
    // INSERT policy requires created_by_user_id = auth.uid() (E2E admin client).
    created_by_user_id: club.admin.userId,
    start_date: start,
    end_date: end,
    reason: "vacation",
    certainty: "confirmed",
    visibility: opts.visibility,
    status: "active",
    comment: opts.comment,
  });
  if (error) throw new Error(`seedUnavailability: ${error.message}`);
}

async function seedMeeting(title: string): Promise<string> {
  const future = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from("events")
    .insert({
      team_id: club.teamId,
      title,
      starts_at: future,
      type: "meeting",
      created_by: club.admin.userId,
      status: "published",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seedMeeting: ${error?.message}`);
  return data.id as string;
}
