/**
 * Vitest config for RLS integration tests.
 *
 * These tests hit the real Supabase project, authenticate as seeded users,
 * and verify that Row-Level Security correctly isolates cross-club data and
 * enforces role permissions. They are intentionally separated from the fast
 * unit-test suite (vitest.config.ts).
 *
 * Run with: bun run test:rls
 */
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rls/**/*.test.ts"],
    globalSetup: ["./tests/rls/_global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Run sequentially in a single worker so seeded fixtures are shared safely.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
