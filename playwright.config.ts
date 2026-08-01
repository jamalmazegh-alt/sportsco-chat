import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright config for Clubero E2E tests.
 *
 * Two projects (also runnable via package scripts):
 *   - core  — 00→25 : API / RLS / beta-closure (~4–15 min)
 *   - ui    — 26→32 + ui-real-flows : real UI clicks (needs E2E_UI=1)
 *
 * Required env vars:
 *   - E2E_BASE_URL              preview/published URL under test
 *   - SUPABASE_URL              same as the app's VITE_SUPABASE_URL
 *   - SUPABASE_PUBLISHABLE_KEY  same as the app's VITE_SUPABASE_PUBLISHABLE_KEY
 *                               (a.k.a. SUPABASE_ANON_KEY in GitHub secrets)
 *   - E2E_ADMIN_EMAIL           pre-created E2E admin user (email confirmed)
 *   - E2E_ADMIN_PASSWORD        password for that user
 *
 * Optional:
 *   - E2E_CLUB_NAME             defaults to "E2E Test Club"
 *   - SUPABASE_SERVICE_ROLE_KEY + E2E_TARGET_PROJECT_REF
 *                               auto-create/repair E2E users + club in globalSetup
 *   - E2E_SUITE=core|ui         when set, only that project runs (CI jobs)
 *
 * See tests/e2e/_fixtures/README.md for setup instructions.
 */
const BASE_URL = process.env.E2E_BASE_URL;
if (!BASE_URL) {
  throw new Error(
    "E2E_BASE_URL is required. Set it to the preview URL, e.g.\n" +
      "  export E2E_BASE_URL=https://id-preview--<project-id>.lovable.app\n" +
      "or in CI as a repo secret. See docs/dev/e2e.md.",
  );
}

const HAS_E2E_CONFIG = Boolean(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) &&
  (process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY) &&
  process.env.E2E_ADMIN_EMAIL &&
  process.env.E2E_ADMIN_PASSWORD,
);

/** 00–25 — data/RLS/beta-closure (historically ~4–6 min green). */
const CORE_MATCH = /\/(0[0-9]|1[0-9]|2[0-5])-[^/]+\.e2e\.ts$/;
/** 26–32 + ui-real-flows — real UI clicks. */
const UI_MATCH = /(\/(2[6-9]|3[0-2])-[^/]+\.e2e\.ts$|\/ui-real-flows\.e2e\.ts$)/;

const suite = process.env.E2E_SUITE; // "core" | "ui" | unset (= both)

const chromium = { ...devices["Desktop Chrome"] };

const projects = HAS_E2E_CONFIG
  ? [
      ...(suite === "ui"
        ? []
        : [
            {
              name: "core",
              testMatch: CORE_MATCH,
              use: chromium,
              timeout: 30_000,
            },
          ]),
      ...(suite === "core"
        ? []
        : [
            {
              name: "ui",
              testMatch: UI_MATCH,
              use: chromium,
              // UI flows need headroom (wizards, toasts, choosers).
              timeout: 90_000,
            },
          ]),
    ]
  : [
      {
        name: "chromium",
        testMatch: /00-missing-supabase-config\.e2e\.ts$/,
        use: chromium,
      },
    ];

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: HAS_E2E_CONFIG
    ? path.join(__dirname, "tests/e2e/_fixtures/global-setup.ts")
    : undefined,
  // Default; each project overrides (core 30s / ui 90s).
  timeout: process.env.E2E_UI === "1" || suite === "ui" ? 90_000 : 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // shared pre-existing club → run sequentially
  forbidOnly: !!process.env.CI,
  // 1 retry: absorb flakes without burning a job on a broken helper.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: "fr-FR",
  },
  projects,
});
