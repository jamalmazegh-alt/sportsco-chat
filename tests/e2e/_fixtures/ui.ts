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
 * Attend la bottom-nav (app hydratée + memberships).
 * Même signal que `25-beta-closure-roles-auth` — `nav[aria-label]` plutôt
 * qu'un match i18n strict sur `nav.primary` (évite les courses de locale).
 *
 * ConsentGate shows a spinner (no nav) while status loads, then may open a
 * modal. Race nav vs privacy dialog, dismiss overlays, then require nav.
 */
async function waitForAppShell(page: Page): Promise<void> {
  const nav = page.locator("nav[aria-label]").first();
  const privacyDialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: /Your privacy|Votre vie privée/i }),
  });
  await Promise.race([
    nav.waitFor({ state: "visible", timeout: 30_000 }),
    privacyDialog.waitFor({ state: "visible", timeout: 30_000 }),
  ]).catch(() => {
    /* fall through — dismiss + final expect below */
  });
  await dismissBlockingOverlays(page);
  await expect(nav).toBeVisible({ timeout: 30_000 });
}

/**
 * Authentifie un rôle pour les parcours UI.
 *
 * Utilise l'injection de session (`loginAs`) — même mécanisme que les specs
 * 00→25 / beta-closure. Le formulaire `/login` est couvert séparément par
 * `loginViaForm` (smoke auth).
 *
 * Important: `waitUntil: "domcontentloaded"` (comme beta-closure). Le défaut
 * Playwright `load` timeout ~30s sur `/home` quand des assets/WS restent
 * ouverts — c'est ce qui faisait échouer toute la suite UI à ~32s.
 */
export async function loginViaUI(page: Page, role: UiRole): Promise<void> {
  const creds = credsFor(role);
  await loginAs(page, creds);
  const res = await page.goto("/home", { waitUntil: "domcontentloaded" });
  if ((res?.status() ?? 0) >= 400) {
    throw new Error(`loginViaUI(${role}): /home returned HTTP ${res?.status()}`);
  }
  await page.waitForURL((url) => url.pathname === "/home" || url.pathname.startsWith("/home/"), {
    timeout: 15_000,
  });
  await waitForAppShell(page);
}

/**
 * ConsentGate + cookie banner block all clicks when E2E users lack up-to-date
 * user_consents (or cookie localStorage). globalSetup seeds consents; this is
 * a UI safety net so a version bump mid-suite does not red the whole UI job.
 */
export async function dismissBlockingOverlays(page: Page): Promise<void> {
  const cookieAccept = page.getByRole("button", { name: /Accept all|Accepter tout/i });
  if (await cookieAccept.isVisible().catch(() => false)) {
    await cookieAccept.click();
  }

  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: /Your privacy|Votre vie privée/i }),
  });
  if (!(await dialog.isVisible().catch(() => false))) return;

  const checkboxes = dialog.getByRole("checkbox");
  const n = await checkboxes.count();
  for (let i = 0; i < n; i += 1) {
    const box = checkboxes.nth(i);
    if (!(await box.isChecked().catch(() => false))) {
      await box.click();
    }
  }
  const accept = dialog.getByRole("button", {
    name: /Accept and continue|Accepter et continuer/i,
  });
  await expect(accept).toBeEnabled({ timeout: 10_000 });
  await accept.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

/**
 * Connexion via le VRAI formulaire `/login` (smoke uniquement).
 * login.tsx fait `window.location.replace("/home")` en cas de succès.
 */
/** Fill a React-controlled <input> when Playwright fill/pressSequentially is a no-op. */
async function fillControlledInput(page: Page, selector: string, value: string): Promise<void> {
  const loc = page.locator(selector);
  await loc.waitFor({ state: "visible" });
  await loc.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    proto?.set?.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await expect(loc).toHaveValue(value, { timeout: 5_000 });
}

export async function loginViaForm(page: Page, role: UiRole = "admin"): Promise<void> {
  const { email, password } = credsFor(role);
  // loginAs is not used here — still pre-accept cookies so the banner does not
  // intercept the submit CTA (z-[100] fixed bottom).
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "clubero_cookie_consent",
        JSON.stringify({ necessary: true, analytics: true, marketing: true }),
      );
    } catch {
      /* ignore */
    }
  });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  await expect(page.locator("#email")).toBeVisible();

  await fillControlledInput(page, "#email", email);
  // Reveal password so browsers/extensions are less likely to swallow keystrokes.
  const showPw = page.getByRole("button", { name: /Afficher le mot de passe|Show password/i });
  if (await showPw.isVisible().catch(() => false)) await showPw.click();
  await fillControlledInput(page, "#password", password);

  await dismissBlockingOverlays(page);
  const submit = page.locator("form.card button.cta[type='submit']");
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL((url) => url.pathname === "/home" || url.pathname.startsWith("/home/"), {
    timeout: 45_000,
  });
  await waitForAppShell(page);
}

/** Navigation via la vraie bottom-nav (accessible + multilingue). */
export async function navTo(page: Page, navKey: string): Promise<void> {
  const nav = page.locator("nav[aria-label]").first();
  await nav.getByRole("link", { name: tx(navKey) }).click();
}

/**
 * Ouvre le formulaire classique de création d'événement.
 *
 * `/events` → « Nouvel événement » ouvre d'abord `EventCreateChooser`
 * (assistant vs classique). Les testids `event-*-input` n'existent que
 * dans `EventFormSheet` (mode classique).
 */
export async function openClassicEventForm(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: tx("events.create") })
    .first()
    .click();
  await page.getByRole("button", { name: tx("eventCreateChooser.classic") }).click();
  await expect(
    page.getByTestId("event-name-input").or(page.getByTestId("event-opponent-input")),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Remplit date + heure de début dans `EventFormSheet`.
 *
 * Indices (0-based) within the open event dialog:
 * - meeting: dateIndex 0, timeIndex 0
 * - match:   dateIndex 1 (match date), timeIndex 1
 * - training (single session): dateIndex 0, timeIndex 1 (start, after convoc)
 */
export async function fillEventStartDateTime(
  page: Page,
  opts: { time?: string; dateIndex?: number; timeIndex?: number } = {},
): Promise<void> {
  const time = opts.time ?? "18:00";
  const dateIndex = opts.dateIndex ?? 0;
  const timeIndex = opts.timeIndex ?? 0;
  const root = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { level: 2 }) })
    .first();

  // Class segment match — lucide may emit lucide-calendar / lucide-Calendar.
  const dateButtons = root.locator("button:has(svg[class*='calendar'])");
  await expect(dateButtons.nth(dateIndex)).toBeVisible({ timeout: 10_000 });
  await dateButtons.nth(dateIndex).click();
  const day = page.getByRole("gridcell").getByRole("button").filter({ hasText: /^\d+$/ });
  const count = await day.count();
  if (count === 0) throw new Error("fillEventStartDateTime: no calendar day buttons");
  await day.nth(Math.min(14, count - 1)).click();

  const clockButtons = root.locator("button:has(svg[class*='clock'])");
  await expect(clockButtons.nth(timeIndex)).toBeVisible({ timeout: 10_000 });
  await clockButtons.nth(timeIndex).click();
  const hhmm = page.locator('input[placeholder="HH:MM"]');
  await expect(hhmm).toBeVisible({ timeout: 5_000 });
  await hhmm.click();
  await hhmm.fill("");
  // Type digits so TimePicker's formatter emits HH:MM via onChange.
  await page.keyboard.type(time.replace(":", ""), { delay: 20 });
  await page.keyboard.press("Enter");
  await expect(clockButtons.nth(timeIndex)).toContainText(time);
}

/**
 * Audience step marker on publication create (exact <label> text).
 */
export function publicationAudienceLabel(page: Page) {
  return page.locator("label").filter({ hasText: /^(Destinataires|Recipients)$/ });
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
