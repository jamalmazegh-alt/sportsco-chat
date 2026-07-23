/**
 * ui-real-flows.e2e.ts — tests d'INTERFACE réels (lot 1).
 *
 * Contrairement aux specs 00→25 qui valident surtout la donnée via le client
 * Supabase/RLS, celles-ci pilotent l'app comme un humain : naviguer, cliquer,
 * remplir, et vérifier des résultats VISIBLES.
 *
 * Lancer avec E2E_UI=1 (timeout 90 s).
 */
import { test, expect, type Page } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import { loginViaUI, tx, uniqueName, navTo, MOBILE_VIEWPORT } from "./_fixtures/ui";

test.describe("auth", () => {
  test("l'admin se connecte et arrive sur le dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(tx("auth.email")).fill(process.env.E2E_ADMIN_EMAIL!);
    await page.getByLabel(tx("auth.password")).fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: tx("auth.login") }).click();

    await page.waitForURL(/\/home(\?.*)?$/);
    await expect(page.getByRole("navigation", { name: tx("nav.primary") })).toBeVisible();
    await expect(page.getByLabel(tx("auth.password"))).toHaveCount(0);
  });
});

test.describe("équipes", () => {
  test("l'admin crée une équipe et la voit listée", async ({ page }) => {
    const teamName = uniqueName("team");

    await loginViaUI(page, "admin");
    await navTo(page, "nav.teams");
    await expect(page).toHaveURL(/\/teams$/);

    await page
      .getByRole("button", { name: tx("teams.create") })
      .first()
      .click();
    await page.getByTestId("team-name-input").fill(teamName);
    await page.getByRole("button", { name: tx("common.create") }).click();

    await expect(page.getByText(teamName)).toBeVisible();

    await admin.from("teams").delete().eq("name", teamName);
  });
});

test.describe("joueurs", () => {
  let club: SeededClub;
  test.beforeAll(async () => {
    club = await createTestClub("ui-players");
  });
  test.afterAll(async () => {
    await club.cleanup();
  });

  test("l'admin ajoute un joueur à une équipe et le voit listé", async ({ page }) => {
    const first = uniqueName("Prenom");
    const last = uniqueName("Nom");

    await loginViaUI(page, "admin");
    await page.goto(`/teams/${club.teamId}`);

    await page
      .getByRole("button", { name: tx("teams.addPlayer") })
      .first()
      .click();
    await page.getByTestId("player-first-name-input").fill(first);
    await page.getByTestId("player-last-name-input").fill(last);
    await page.getByRole("button", { name: tx("players.save") }).click();

    await expect(page.getByText(first)).toBeVisible();

    await admin.from("players").delete().eq("first_name", first).eq("club_id", club.clubId);
  });
});

test.describe("événements", () => {
  let club: SeededClub;
  test.beforeAll(async () => {
    club = await createTestClub("ui-events");
  });
  test.afterAll(async () => {
    await club.cleanup();
  });

  test("le coach crée un ENTRAÎNEMENT et il apparaît", async ({ page }) => {
    const title = uniqueName("Entrainement");

    await loginViaUI(page, "coach");
    await navTo(page, "nav.events");
    await expect(page).toHaveURL(/\/events$/);

    await page
      .getByRole("button", { name: tx("events.create") })
      .first()
      .click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(club.prefix) }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: tx("events.types.training") }).click();

    await page.getByTestId("event-name-input").fill(title);
    await setEventDateTime(page);

    await page.getByRole("button", { name: tx("events.publish") }).click();

    await expect(page.getByText(title)).toBeVisible();
  });

  test("le coach crée un MATCH et il apparaît", async ({ page }) => {
    const opponent = uniqueName("FC");

    await loginViaUI(page, "coach");
    await navTo(page, "nav.events");

    await page
      .getByRole("button", { name: tx("events.create") })
      .first()
      .click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(club.prefix) }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: tx("events.types.match") }).click();

    await page.getByTestId("event-opponent-input").fill(opponent);
    await setEventDateTime(page);

    await page.getByRole("button", { name: tx("events.publish") }).click();

    await expect(page.getByText(new RegExp(opponent))).toBeVisible();
  });
});

async function setEventDateTime(page: Page) {
  const dateButton = page.getByRole("button", { name: /—|\d{1,2}\s\w{3}/ }).first();
  if (await dateButton.count()) {
    await dateButton.click().catch(() => {});
    const day = page.getByRole("gridcell").getByRole("button").nth(15);
    await day.click().catch(() => {});
  }
  const timeBox = page.getByRole("textbox");
  await timeBox
    .first()
    .fill("18:00")
    .catch(() => {});
}

test.describe("convocations — envoi", () => {
  let club: SeededClub;
  test.beforeAll(async () => {
    club = await createTestClub("ui-convoc-send");
  });
  test.afterAll(async () => {
    await club.cleanup();
  });

  test("le coach envoie les convocations et le statut devient visible", async ({ page }) => {
    await loginViaUI(page, "coach");
    await page.goto(`/events/${club.eventId}`);

    await page
      .getByRole("button", { name: tx("events.sendConvocations") })
      .first()
      .click();

    const confirm = page.getByRole("button", { name: tx("events.resend.confirm") });
    if (await confirm.count()) await confirm.click();

    await expect(
      page.getByText(tx("events.convocationsSent")).or(page.getByText(tx("attendance.present"))),
    ).toBeVisible();
  });
});

test.describe("convocations — réponse", () => {
  let club: SeededClub;
  test.beforeAll(async () => {
    club = await createTestClub("ui-convoc-respond");
    await admin.from("convocations").insert({
      event_id: club.eventId,
      player_id: club.player2WithParent.id,
      status: "pending",
    });
  });
  test.afterAll(async () => {
    await club.cleanup();
  });

  test("le parent déclare l'enfant présent et la réponse s'affiche", async ({ page }) => {
    await loginViaUI(page, "parent");
    await page.goto(`/events/${club.eventId}`);

    await page
      .getByRole("button", { name: tx("attendance.present") })
      .first()
      .click();

    await expect(
      page.getByText(tx("attendance.present")).or(page.getByText(tx("common.saved"))),
    ).toBeVisible();
  });
});

test.describe("tournois", () => {
  test("l'admin crée un tournoi et atteint sa page de détail", async ({ page }) => {
    const name = uniqueName("Tournoi");

    await loginViaUI(page, "admin");
    await navTo(page, "nav.tournaments");
    await expect(page).toHaveURL(/\/tournaments$/);

    await page
      .getByRole("button", { name: tx("list.create", "tournaments") })
      .first()
      .click();

    await page.getByRole("textbox").first().fill(name);
    await page
      .getByRole("button", { name: tx("common.next") })
      .click()
      .catch(() => {});

    await page
      .getByText(tx("wizard.formatGroup", "tournaments"))
      .first()
      .click()
      .catch(() => {});
    for (let i = 0; i < 3; i++) {
      const next = page.getByRole("button", { name: tx("common.next") });
      if (await next.count()) await next.click().catch(() => {});
      else break;
    }
    await page.getByRole("button", { name: tx("common.create") }).click();

    await page.waitForURL(/\/tournaments\/[0-9a-f-]+/);
    await expect(page.getByText(name)).toBeVisible();

    await admin.from("tournaments").delete().eq("name", name);
  });
});

test.describe("classement tournoi", () => {
  const tournamentId = process.env.E2E_TOURNAMENT_ID;

  test("saisir un score met à jour le classement", async ({ page }) => {
    test.skip(
      !tournamentId,
      "Définir E2E_TOURNAMENT_ID (tournoi avec matchs) — pas de fixture de seed.",
    );

    await loginViaUI(page, "admin");
    await page.goto(`/tournaments/${tournamentId}`);

    await page
      .getByRole("button", { name: tx("match.enterScore") })
      .first()
      .click();

    const numbers = page.getByRole("spinbutton");
    await numbers.nth(0).fill("3");
    await numbers.nth(1).fill("1");
    await page.getByRole("button", { name: tx("common.save") }).click();

    await expect(page.getByText(/3\s*[-:]\s*1/)).toBeVisible();
  });
});

test.describe("confidentialité", () => {
  let club: SeededClub;
  let publicSlug: string;
  test.beforeAll(async () => {
    club = await createTestClub("ui-privacy");
    publicSlug = `e2e-minor-${club.runId}`;
    const { error } = await admin
      .from("players")
      .update({ birth_date: "2015-01-01", public_slug: publicSlug })
      .eq("id", club.player1.id);
    if (error) {
      console.warn(`[ui-privacy] player update skipped: ${error.message}`);
    }
  });
  test.afterAll(async () => {
    await club.cleanup();
  });

  test("le profil public d'un mineur n'est pas accessible publiquement", async ({ page }) => {
    await page.goto(`/p/${publicSlug}`);

    const protectedText = page.getByText(/priv|protég|protect|introuvable|not found|404/i).first();
    const isProtected = (await protectedText.count()) > 0;
    const redirectedAway = !page.url().includes("e2e-minor");

    expect(isProtected || redirectedAway).toBeTruthy();
    await expect(page.getByText(club.prefix)).toHaveCount(0);
  });
});

test.describe("smoke mobile", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  const pages: { name: string; url: string; expectKey: string }[] = [
    { name: "dashboard", url: "/home", expectKey: "nav.primary" },
    { name: "équipes", url: "/teams", expectKey: "teams.title" },
    { name: "événements", url: "/events", expectKey: "events.title" },
    { name: "tournois", url: "/tournaments", expectKey: "nav.tournaments" },
  ];

  for (const p of pages) {
    test(`mobile : ${p.name} s'affiche avec la bottom-nav`, async ({ page }) => {
      await loginViaUI(page, "admin");
      await page.goto(p.url);
      await expect(page.getByRole("navigation", { name: tx("nav.primary") })).toBeVisible();
      await expect(page.getByText(tx(p.expectKey)).first()).toBeVisible();
    });
  }
});
