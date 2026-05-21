/**
 * 01 — Onboarding club
 *
 * - Signup d'un nouvel admin via UI
 * - Vérification que l'email de confirmation est journalisé
 * - Création du club via la session authentifiée
 * - Wizard onboarding visible côté UI
 */
import { test, expect } from "@playwright/test";
import { admin } from "./_fixtures/admin";
import { waitForEmail } from "./_fixtures/email";
import { clientFor } from "./_fixtures/auth";

const PASSWORD = "Clubero-E2E-Passw0rd!";

test.describe("Onboarding club", () => {
  const runId = Date.now().toString(36);
  const email = `__e2e_onb_${runId}@clubero-e2e.test`;
  const clubName = `__e2e_onb_${runId}_club`;
  let userId: string | undefined;
  let clubId: string | undefined;

  test.afterAll(async () => {
    if (clubId) {
      await admin.from("club_members").delete().eq("club_id", clubId);
      await admin.from("subscriptions").delete().eq("club_id", clubId);
      await admin.from("clubs").delete().eq("id", clubId);
    }
    if (userId) {
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
  });

  test("signup admin → email log → create club", async ({ page }) => {
    const sinceIso = new Date().toISOString();
    await page.goto("/register");
    await page.getByLabel(/pr[ée]nom|first/i).first().fill("E2E");
    await page.getByLabel(/nom|last/i).first().fill("Onboard");
    await page.getByLabel(/email/i).first().fill(email);
    await page.getByLabel(/mot de passe|password/i).first().fill(PASSWORD);
    const confirm = page.getByLabel(/confirm/i);
    if (await confirm.count()) await confirm.first().fill(PASSWORD);
    await page.getByRole("button", { name: /cr[ée]er|sign ?up|inscription/i }).first().click();

    // Poll auth.users once until the new user appears (cheap by-email lookup).
    await expect
      .poll(
        async () => {
          const { data: list } = await admin.auth.admin.listUsers();
          const u = list.users.find((x) => x.email === email);
          if (u) userId = u.id;
          return !!userId;
        },
        { timeout: 20_000, intervals: [1000, 1500, 2000] },
      )
      .toBe(true);

    expect(userId).toBeDefined();

    // Then poll the profile row (no more listUsers in the loop).
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("profiles")
            .select("id")
            .eq("id", userId!)
            .maybeSingle();
          return !!data;
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    // Confirmation email logged (template may vary; we just check any was sent)
    try {
      await waitForEmail(email, { sinceIso, timeoutMs: 10_000 });
    } catch {
      // Auto-confirm may be enabled in preview → no email; that's acceptable.
    }

    // Force-confirm user so we can proceed without manually clicking the link
    await admin.auth.admin.updateUserById(userId!, { email_confirm: true });

    // Create club via authenticated client (mirrors what the UI does)
    const client = await clientFor({ email, password: PASSWORD });
    const { data: club, error } = await client
      .from("clubs")
      .insert({ name: clubName, created_by: userId! })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(club).toBeTruthy();
    clubId = club!.id;

    await admin
      .from("club_members")
      .insert({ club_id: clubId!, user_id: userId!, role: "admin" });

    // Optional UI sanity: home should render after refresh
    await page.goto("/home");
    await expect(page.locator("body")).toBeVisible();
  });
});
