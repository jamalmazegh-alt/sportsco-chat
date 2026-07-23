/**
 * Helpers pour les tests d'INTERFACE (clics, saisie, navigation).
 *
 * Les specs existantes (00→25) valident surtout la donnée via Supabase/RLS.
 * Ces helpers servent aux specs qui pilotent réellement l'UI.
 */
import { type Page, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_COACH, E2E_PLAYER, E2E_PARENT } from "./admin";
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
 * Connexion via le VRAI formulaire. login.tsx fait
 * window.location.replace("/home") en cas de succès.
 *
 * Password field: use `#password` — `getByLabel(auth.password)` also matches
 * the show/hide toggle (`aria-label="Afficher le mot de passe"`).
 */
export async function loginViaUI(page: Page, role: UiRole): Promise<void> {
  const { email, password } = credsFor(role);
  await page.goto("/login");
  await page.getByLabel(tx("auth.email")).fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: tx("auth.login") }).click();
  await page.waitForURL(/\/home(\?.*)?$/, { timeout: 30_000 });
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
