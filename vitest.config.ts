import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/tests/unit/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.server.ts",
        "src/lib/**/*.functions.ts",
        "src/lib/auth-context.tsx",
        "src/lib/use-*.ts",
        "src/lib/i18n.ts",
        "src/lib/ai-gateway.ts",
        "src/lib/stripe.server.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});

