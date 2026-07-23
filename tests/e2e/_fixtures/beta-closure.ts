/**
 * Shared helpers for beta-closure smoke specs (24 / 25).
 *
 * Do NOT scan `page.content()` / raw HTML: SSR + router manifests embed
 * paths like `/following` and marketing FAQ prose uses verbs like
 * « suivre », which are not V2 CTAs.
 *
 * Instead:
 *  - forbidden hrefs on real anchors
 *  - forbidden labels on navigational chrome (links + nav)
 *  - a tighter label set on buttons (excludes marketing mock copy like « Suivre »)
 */
import { expect, type Page } from "@playwright/test";

/** Labels that must not appear as navigational link/nav text. */
export const FORBIDDEN_NAV_LABELS: RegExp[] = [
  /\bSuivre\b/,
  /\bFollowing\b/i,
  /Mettre en relation/i,
  /Connecter Stripe/i,
  /\bPayer\b/i,
  /\bCotisation/i,
  /Acheter un pack/i,
  /Profil public/i,
  /\bCagnotte\b/i,
];

/**
 * Labels that must not appear on buttons. Excludes « Suivre » / Cotisation /
 * Cagnotte / Payer — those show up in inert marketing mocks and FAQ-adjacent
 * UI copy without being live V2 entry points.
 */
export const FORBIDDEN_BUTTON_LABELS: RegExp[] = [
  /\bFollowing\b/i,
  /Mettre en relation/i,
  /Connecter Stripe/i,
  /Acheter un pack/i,
  /Profil public/i,
];

/** Paths that must not appear as navigable hrefs while V2 flags are off. */
export const FORBIDDEN_HREF_PREFIXES = [
  "/following",
  "/follow-ups",
  "/payments",
  "/tournaments/new-from-pass",
  "/tournaments/pass-success",
];

/** Union used by onboarding-checklist text scans. */
export const FORBIDDEN_CTA_LABELS: RegExp[] = FORBIDDEN_NAV_LABELS;

async function collectText(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const nodes = Array.from(document.querySelectorAll(sel));
    return nodes
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }, selector);
}

export async function assertNoV2Ctas(page: Page, context: string): Promise<void> {
  const navSurface = await collectText(page, "a, nav, [role='navigation']");
  for (const re of FORBIDDEN_NAV_LABELS) {
    expect(navSurface, `${context}: forbidden nav CTA ${re}`).not.toMatch(re);
  }

  const buttonSurface = await collectText(page, "button, [role='button']");
  for (const re of FORBIDDEN_BUTTON_LABELS) {
    expect(buttonSurface, `${context}: forbidden button CTA ${re}`).not.toMatch(re);
  }

  const hrefs = await page.$$eval("a[href]", (els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  for (const href of hrefs) {
    const path = href.split("?")[0].split("#")[0] || "/";
    for (const banned of FORBIDDEN_HREF_PREFIXES) {
      expect(
        path === banned || path.startsWith(`${banned}/`),
        `${context}: forbidden href ${href}`,
      ).toBe(false);
    }
  }
}
