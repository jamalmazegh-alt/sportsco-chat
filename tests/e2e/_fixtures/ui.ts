/**
 * Helpers pour les tests d'INTERFACE (clics, saisie, navigation).
 *
 * Les specs existantes (00→25) valident surtout la donnée via Supabase/RLS.
 * Ces helpers servent aux specs qui pilotent réellement l'UI.
 */
import { type Page, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_COACH, E2E_PLAYER, E2E_PARENT } from "./admin";
import { loginAs } from "./auth";
import { tx, txOr, type Ns } from "./i18n-matchers";

export { tx, txOr, type Ns };

/** Nom unique, sans collision, pour les entités créées. */
export function uniqueName(prefix = "ui"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export type UiRole = "admin" | "coach" | "player" | "parent";

function credsFor(role: UiRole): { email: string; password: string } {
  switch (role) {
    case "coach":
      return { email: E2E_COACH.email, password: E2E_COACH.password };
    case "player":
      return { email: E2E_PLAYER.email, password: E2E_PLAYER.password };
    case "parent":
      return { email: E2E_PARENT.email, password: E2E_PARENT.password };
    default:
      return { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD };
  }
}

/**
 * Authentifie un rôle pour les parcours UI.
 *
 * Utilise l'injection de session (`loginAs`) — même mécanisme que les specs
 * 00→25 / beta-closure. Le formulaire `/login` est couvert séparément par
 * `loginViaForm` (smoke auth). Évite les timeouts 30s dus aux inputs
 * contrôlés React + `window.location.replace` sous Playwright.
 */
export async function loginViaUI(page: Page, role: UiRole): Promise<void> {
  const creds = credsFor(role);
  await loginAs(page, creds);
  await page.goto("/home");
  await page.waitForURL((url) => url.pathname === "/home" || url.pathname.startsWith("/home/"), {
    timeout: 30_000,
  });
}

/**
 * Connexion via le VRAI formulaire `/login` (smoke uniquement).
 * login.tsx fait `window.location.replace("/home")` en cas de succès.
 */
export async function loginViaForm(page: Page, role: UiRole = "admin"): Promise<void> {
  const { email, password } = credsFor(role);
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();

  // Click + fill: plus fiable que getByLabel sur le layout floating-label.
  // `#password` — getByLabel(auth.password) matche aussi le toggle show/hide.
  await page.locator("#email").click();
  await page.locator("#email").fill(email);
  await expect(page.locator("#email")).toHaveValue(email);
  await page.locator("#password").click();
  await page.locator("#password").fill(password);
  await expect(page.locator("#password")).toHaveValue(password);

  await Promise.all([
    page.waitForURL((url) => url.pathname === "/home" || url.pathname.startsWith("/home/"), {
      timeout: 45_000,
    }),
    page.locator("form.card button.cta[type='submit']").click(),
  ]);
}

/** Navigation via la vraie bottom-nav (accessible + multilingue). */
export async function navTo(page: Page, navKey: string): Promise<void> {
  const nav = page.getByRole("navigation", { name: tx("nav.primary") });
  await nav.getByRole("link", { name: tx(navKey) }).click();
}

/**
 * Attend un toast sonner. Les mutations de l'app confirment quasi toujours
 * par un toast — c'est le signal de succès le plus stable côté UI.
 */
export async function expectToast(page: Page, matcher: RegExp): Promise<void> {
  await expect(page.getByText(matcher).first()).toBeVisible({ timeout: 15_000 });
}

/** Viewport téléphone pour les smoke tests mobiles. */
export const MOBILE_VIEWPORT = { width: 390, height: 844 };
