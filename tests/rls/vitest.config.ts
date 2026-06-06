import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rls/**/*.rls.ts"],
    globalSetup: ["./tests/rls/_global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    isolate: false,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});

