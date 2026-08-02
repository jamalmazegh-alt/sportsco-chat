import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // Sorties de build Gradle : Capacitor y recopie `native-bridge.js`, que
      // le lint signale alors qu'il n'est pas à nous.
      "android/app/build",
      "android/build",
      "src/integrations/supabase/types.ts",
      "**/routeTree.gen.ts",
      "**/*.gen.ts",
      "src/routes/\\[.mcp\\]/**",
      "src/routes/\\[.well-known\\]/**",
      "src/routes/mcp.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Boundary: support-view components must only import UI primitives + own
  // subtree. Any other app component may run queries/mutations that leak into
  // the superadmin's normal session cache.
  {
    files: ["src/components/support-view/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/components/(?!ui/|support-view/).+",
              message:
                "support-view components may only import from @/components/ui/* or @/components/support-view/*.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
