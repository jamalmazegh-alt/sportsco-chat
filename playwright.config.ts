import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Clubero E2E tests.
 *
 * - Base URL: E2E_BASE_URL (defaults to Lovable preview).
 * - Tests live in tests/e2e/ as *.e2e.ts files.
 * - Uses Chromium only in V1 (Firefox/WebKit can be re-enabled when needed).
 */
const BASE_URL = process.env.E2E_BASE_URL;
if (!BASE_URL) {
  throw new Error(
    "E2E_BASE_URL is required. Set it to the preview URL, e.g.\n" +
    "  export E2E_BASE_URL=https://id-preview--<project-id>.lovable.app\n" +
    "or in CI as a repo secret. See docs/dev/e2e.md.",
  );
}

const HAS_SUPABASE_E2E_CONFIG = Boolean(
  (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: HAS_SUPABASE_E2E_CONFIG
    ? /.*\.e2e\.ts$/
    : /00-missing-supabase-config\.e2e\.ts$/,
  timeout: process.env.E2E_UI === "1" ? 90_000 : 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // shared seed → run sequentially in V1
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
