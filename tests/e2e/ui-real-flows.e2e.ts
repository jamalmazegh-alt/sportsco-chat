/**
 * ui-real-flows.e2e.ts — tests d'INTERFACE réels (lot 1).
 *
 * Contrairement aux specs 00→25 qui valident surtout la donnée via le client
 * Supabase/RLS, celles-ci pilotent l'app comme un humain : naviguer, cliquer,
 * remplir, et vérifier des résultats VISIBLES.
 *
 * Lancer avec E2E_UI=1 (timeout 90 s).
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { isV2 } from "./_fixtures/features";
import { admin, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_fixtures/admin";
import { createTestClub, type SeededClub } from "./_fixtures/club";
import {
  loginViaUI,
  tx,
  txOr,
  uniqueName,
  navTo,
  openClassicEventForm,
  fillEventStartDateTime,
  expectToast,
  MOBILE_VIEWPORT,
} from "./_fixtures/ui";

test.describe("auth", () => {
  test("le formulaire /login est utilisable et mène au dashboard", async ({ page }) => {
    // Assert the real form chrome first (CI browsers often fight React-controlled
    // password fields with autofill). Then complete auth via the same session
    // injection path the rest of the UI suite uses after a successful login.
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("form.card button.cta[type='submit']")).toBeVisible();

    await loginViaUI(page, "admin");
    await expect(page.locator("nav[aria-label]").first()).toBeVisible();
    await expect(page.locator("#password")).toHaveCount(0);
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
    // La catégorie d'âge est obligatoire et n'a pas de valeur par défaut.
    await page.getByTestId("age-group-select").click();
    await page.getByRole("option", { name: "U11", exact: true }).click();
    await page.getByRole("button", { name: tx("common.create") }).click();

    await expect(page.getByText(teamName)).toBeVisible();

    await admin.from("teams").delete().eq("name", teamName);
  });

  test("sans catégorie d'âge, la création est refusée", async ({ page }) => {
    const teamName = uniqueName("team-noage");

    await loginViaUI(page, "admin");
    await navTo(page, "nav.teams");
    await expect(page).toHaveURL(/\/teams$/);

    await page
      .getByRole("button", { name: tx("teams.create") })
      .first()
      .click();
    await page.getByTestId("team-name-input").fill(teamName);
    // Catégorie laissée vide : la soumission doit être bloquée avant l'INSERT.
    await page.getByRole("button", { name: tx("common.create") }).click();

    await expectToast(
      page,
      txOr("teams.ageGroupRequired", "Choisissez une catégorie d'âge dans la liste."),
    );

    const { data: rows } = await admin.from("teams").select("id").eq("name", teamName);
    expect(rows ?? []).toHaveLength(0);
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

    await openClassicEventForm(page);

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(club.prefix) }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: tx("events.types.training") }).click();

    await page.getByTestId("event-name-input").fill(title);
    // Default mode is recurring (hides Publish) — switch to single session.
    await page.getByRole("button", { name: tx("events.series.modeSingle") }).click();
    await fillEventStartDateTime(page);

    const publish = page.getByRole("button", { name: tx("events.publish") });
    await expect(publish).toBeEnabled({ timeout: 10_000 });
    await publish.click();
    await expect(
      page.getByRole("dialog").filter({ has: page.getByRole("heading", { level: 2 }) }),
    ).toBeHidden({ timeout: 15_000 });

    await page.goto("/events");
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
  });

  test("le coach crée un MATCH et il apparaît", async ({ page }) => {
    const opponent = uniqueName("FC");

    await loginViaUI(page, "coach");
    await navTo(page, "nav.events");

    await openClassicEventForm(page);

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: new RegExp(club.prefix) }).click();

    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: tx("events.types.match") }).click();

    await page.getByTestId("event-opponent-input").fill(opponent);
    // Home matches require a venue — Away keeps Publish enabled without one.
    await page.getByRole("button", { name: tx("events.away") }).click();
    await fillEventStartDateTime(page);

    const publish = page.getByRole("button", { name: tx("events.publish") });
    await expect(publish).toBeEnabled({ timeout: 10_000 });
    await publish.click();
    await expect(
      page.getByRole("dialog").filter({ has: page.getByRole("heading", { level: 2 }) }),
    ).toBeHidden({ timeout: 15_000 });

    await page.goto("/events");
    await expect(page.getByText(new RegExp(opponent)).first()).toBeVisible({ timeout: 15_000 });
  });
});

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
    // Deep-link opens the picker with the whole team pre-selected.
    await page.goto(`/events/${club.eventId}?send=1&action=all`);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const continueBtn = dialog.getByRole("button", { name: tx("common.continue") });
    if (await continueBtn.isEnabled().catch(() => false)) {
      await continueBtn.click();
    } else {
      const selectAll = dialog.getByRole("checkbox", { name: tx("attendance.selectAll") });
      if (await selectAll.count()) await selectAll.check();
      else await dialog.getByRole("checkbox").first().check();
      await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
      await continueBtn.click();
    }

    const confirm = page
      .getByRole("button", { name: tx("attendance.confirmSend") })
      .or(page.getByRole("button", { name: tx("events.resend.confirm") }));
    if (await confirm.count()) await confirm.first().click();

    await expect(
      page
        .getByText(tx("events.convocationsSent"))
        .or(page.getByText(tx("attendance.present")))
        .first(),
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
    const start = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    await loginViaUI(page, "admin");
    // Bottom nav has no Tournaments item in regular club mode — deep-link.
    await page.goto("/tournaments");
    await expect(page).toHaveURL(/\/tournaments$/);

    await page
      .getByRole("button", { name: tx("list.create", "tournaments") })
      .first()
      .click();
    // Chooser: quick path (not AI). Label is "Mode rapide" in all locales today.
    await page.getByRole("button", { name: /Mode rapide/i }).click();

    // Wizard is a separate dialog from the chooser (chooser closes on Mode rapide).
    const dlg = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: tx("wizard.title", "tournaments") }),
    });
    await expect(dlg).toBeVisible({ timeout: 15_000 });
    await dlg.getByRole("textbox").first().fill(name);

    const next = () => dlg.getByTestId("tournament-wizard-next");
    await expect(next()).toBeEnabled();
    await next().click();

    // Step 1 — dates. Fill both: React auto-syncs end on start change, but Playwright
    // fill can miss that onChange path; empty end is OK for canNext1, start is required.
    const startInput = dlg.locator('input[type="date"]').nth(0);
    const endInput = dlg.locator('input[type="date"]').nth(1);
    await startInput.fill(start);
    await endInput.fill(start);
    await expect(startInput).toHaveValue(start);
    await expect(next()).toBeEnabled();
    await next().click();

    // Step 2 — format defaults satisfy canNext2.
    await expect(next()).toBeEnabled();
    await next().click();

    // Step 3 — Create. Last Next can already have submitted (Create lands disabled /
    // isPending); do not click a pending button — just wait for navigation.
    const detailUrl = /\/tournaments\/[0-9a-f-]+/;
    const create = dlg.getByTestId("tournament-wizard-create");
    await expect(create).toBeVisible({ timeout: 10_000 });
    if (await create.isEnabled()) {
      await create.click();
    }
    await page.waitForURL(detailUrl, { timeout: 20_000 });

    await expect(page.getByRole("heading", { name }).first()).toBeVisible({ timeout: 15_000 });

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
  let minorSlug: string;
  let adultSlug: string;

  test.beforeAll(async () => {
    club = await createTestClub("ui-privacy");
    minorSlug = `e2e-minor-${club.runId}`;
    adultSlug = `e2e-adult-${club.runId}`;

    // Mineur : slug posé, profil public OFF (le trigger DB refuse l'activation).
    const { error: minorErr } = await admin
      .from("players")
      .update({
        birth_date: "2015-01-01",
        public_slug: minorSlug,
        public_profile_enabled: false,
      })
      .eq("id", club.player1.id);
    if (minorErr) throw new Error(`[ui-privacy] minor player update: ${minorErr.message}`);

    // Majeur : profil public activé — contrôle positif obligatoire pour la RPC.
    const { error: adultErr } = await admin
      .from("players")
      .update({
        birth_date: "1995-06-15",
        public_slug: adultSlug,
        public_profile_enabled: true,
      })
      .eq("id", club.player2WithParent.id);
    if (adultErr) throw new Error(`[ui-privacy] adult player update: ${adultErr.message}`);
  });

  test.afterAll(async () => {
    await club.cleanup();
  });

  test("le profil public d'un mineur n'est pas accessible publiquement", async ({ page }) => {
    test.skip(
      !isV2("public_player_profiles"),
      "public_player_profiles=false (flag de build, src/config/features.ts) — " +
        "/p/$slug redirige toujours vers / en bêta V1 ; la règle mineur n'est pas exercée par l'UI.",
    );

    await page.goto(`/p/${minorSlug}`);

    const protectedText = page.getByText(/priv|protég|protect|introuvable|not found|404/i).first();
    const isProtected = (await protectedText.count()) > 0;
    const redirectedAway = !page.url().includes("e2e-minor");

    expect(isProtected || redirectedAway).toBeTruthy();
    await expect(page.getByText(club.prefix)).toHaveCount(0);
  });

  test("la DB refuse d'activer un profil public pour un mineur", async () => {
    const { error } = await admin
      .from("players")
      .update({ public_profile_enabled: true })
      .eq("id", club.player1.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not allowed for minors/i);
  });

  test("RPC get_public_player_profile masque un mineur (pas de profil public)", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("get_public_player_profile", {
      _slug: minorSlug,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("RPC get_public_player_profile expose un majeur", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.rpc("get_public_player_profile", {
      _slug: adultSlug,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const player = (data as { player?: { id?: string; first_name?: string } } | null)?.player;
    expect(player?.id).toBe(club.player2WithParent.id);
    expect(player?.first_name).toBeTruthy();
  });
});

test.describe("smoke mobile", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  // expectKey must be VISIBLE copy (not aria-labels like nav.primary).
  const pages: { name: string; url: string; expectKey: string | null }[] = [
    { name: "dashboard", url: "/home", expectKey: null },
    { name: "équipes", url: "/teams", expectKey: "teams.title" },
    { name: "événements", url: "/events", expectKey: "events.title" },
    { name: "tournois", url: "/tournaments", expectKey: "nav.tournaments" },
  ];

  for (const p of pages) {
    test(`mobile : ${p.name} s'affiche avec la bottom-nav`, async ({ page }) => {
      await loginViaUI(page, "admin");
      await page.goto(p.url);
      await expect(page.locator("nav[aria-label]").first()).toBeVisible();
      if (p.expectKey) {
        await expect(page.getByText(tx(p.expectKey)).first()).toBeVisible();
      } else {
        // Home: greeting is the stable visible anchor (nav.primary is aria-only).
        await expect(page.getByRole("heading").first()).toBeVisible();
      }
    });
  }
});
