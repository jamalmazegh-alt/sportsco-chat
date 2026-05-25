import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Clubero E2E tests.
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
 *
 * See tests/e2e/_fixtures/README.md for one-time setup instructions.
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

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: HAS_E2E_CONFIG
    ? /.*\.e2e\.ts$/
    : /00-missing-supabase-config\.e2e\.ts$/,
  globalSetup: HAS_E2E_CONFIG
    ? require.resolve("./tests/e2e/_fixtures/global-setup.ts")
    : undefined,
  timeout: process.env.E2E_UI === "1" ? 90_000 : 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // shared pre-existing club → run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
