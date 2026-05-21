import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Clubero E2E tests.
 *
 * - Base URL: E2E_BASE_URL (defaults to Lovable preview).
 * - Tests live in tests/e2e/ as *.e2e.ts files.
 * - Uses Chromium only in V1 (Firefox/WebKit can be re-enabled when needed).
 */
const BASE_URL =
  process.env.E2E_BASE_URL ??
  "https://id-preview--619b13f2-91ef-4dee-b96c-f49b38d86b39.lovable.app";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.e2e\.ts$/,
  timeout: 90_000,
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
