/**
 * 25 — Beta closure smoke (authenticated role matrix / mobile 375px)
 *
 * PR4D Axe 1 : pour chacun des rôles authentifiés disponibles dans
 * l'environnement E2E, on vérifie après login que la home charge sans
 * erreur, que la bottom-nav ne surface aucune entrée V2 et qu'aucun
 * CTA paiement / social / profil public n'est rendu.
 *
 * Rôles couverts par défaut (déjà seedés via globalSetup) :
 *   - admin     (E2E_ADMIN_*)
 *   - coach     (E2E_COACH_*)
 *   - player    (E2E_PLAYER_*)
 *   - parent    (E2E_PARENT_*)
 *
 * Rôles optionnels (skip si creds manquantes) :
 *   - tournament_organizer (E2E_TOURN_ORG_*)
 *   - tournament_staff     (E2E_TOURN_STAFF_*)
 *
 * Les rôles optionnels sont marqués `test.skip` quand les variables ne
 * sont pas présentes, plutôt que de faire planter la matrice — fournir
 * les fixtures fera passer la couverture automatiquement.
 */
import { test, expect } from "@playwright/test";
import { loginAs } from "./_fixtures/auth";

const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

test.use({ viewport: { width: 375, height: 812 } });

type RoleSpec = {
  name: string;
  emailEnv: string;
  passwordEnv: string;
  optional?: boolean;
};

const ROLES: RoleSpec[] = [
  { name: "admin",  emailEnv: "E2E_ADMIN_EMAIL",  passwordEnv: "E2E_ADMIN_PASSWORD" },
  { name: "coach",  emailEnv: "E2E_COACH_EMAIL",  passwordEnv: "E2E_COACH_PASSWORD" },
  { name: "player", emailEnv: "E2E_PLAYER_EMAIL", passwordEnv: "E2E_PLAYER_PASSWORD" },
  { name: "parent", emailEnv: "E2E_PARENT_EMAIL", passwordEnv: "E2E_PARENT_PASSWORD" },
  { name: "tournament_organizer", emailEnv: "E2E_TOURN_ORG_EMAIL",   passwordEnv: "E2E_TOURN_ORG_PASSWORD",   optional: true },
  { name: "tournament_staff",     emailEnv: "E2E_TOURN_STAFF_EMAIL", passwordEnv: "E2E_TOURN_STAFF_PASSWORD", optional: true },
];

// Labels strictement interdits hors d'un flip de flag V2.
const FORBIDDEN_LABELS: RegExp[] = [
  /Suivre\b/i,
  /Following/i,
  /Mettre en relation/i,
  /Connecter Stripe/i,
  /\bPayer\b/i,
  /Cotisation/i,
  /Acheter un pack/i,
  /Profil public/i,
  /Cagnotte/i,
];

// Liens autorisés dans la bottom-nav (V1 stricte).
const ALLOWED_NAV_HREFS = new Set([
  "/home",
  "/events",
  "/teams",
  "/inbox",
  "/profile",
  "/tournaments",
  "/admin",
]);

test.describe("Beta closure — authenticated role matrix (mobile 375)", () => {
  for (const role of ROLES) {
    const email = process.env[role.emailEnv];
    const password = process.env[role.passwordEnv];
    const skip = !email || !password;

    test(`role ${role.name}: home + nav surface aucune feature V2`, async ({ page }) => {
      test.skip(
        Boolean(skip),
        `${role.emailEnv}/${role.passwordEnv} non fournis — fixture ${role.optional ? "optionnelle" : "requise"} manquante.`,
      );

      await loginAs(page, { email: email!, password: password! });
      const res = await page.goto(BASE + "/home", { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0, `${role.name} /home status`).toBeLessThan(400);

      // Attend que l'app soit hydratée (présence de la bottom-nav).
      await page.waitForSelector("nav[aria-label]", { timeout: 15_000 }).catch(() => {});

      // 1) Aucune étiquette V2 visible dans le DOM rendu.
      const html = await page.content();
      for (const re of FORBIDDEN_LABELS) {
        expect(html, `${role.name}: forbidden CTA ${re} on /home`).not.toMatch(re);
      }

      // 2) Bottom-nav : tous les liens sont dans la whitelist V1.
      const navHrefs = await page.$$eval(
        'nav[aria-label] a[href]',
        (els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""),
      );
      for (const href of navHrefs) {
        const path = href.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
        expect(
          [...ALLOWED_NAV_HREFS].some((allowed) => path === allowed || path.startsWith(allowed + "/")),
          `${role.name}: bottom-nav contient un href non-whitelisté: ${href}`,
        ).toBeTruthy();
      }

      // 3) Onboarding / checklist : si présent, aucun item V2.
      const checklist = await page.$('[data-testid="onboarding-checklist"], [data-onboarding-checklist]');
      if (checklist) {
        const text = (await checklist.textContent()) ?? "";
        for (const re of FORBIDDEN_LABELS) {
          expect(text, `${role.name}: onboarding checklist contient ${re}`).not.toMatch(re);
        }
      }
    });
  }
});
