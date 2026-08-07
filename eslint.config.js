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
  // Garde-fou natif : aucun appel réseau vers un chemin relatif dans le code
  // qui tourne dans la WebView.
  //
  // Dans l'application Capacitor, l'origine est celle du bundle embarqué
  // (`https://localhost` / `capacitor://localhost`) : un `fetch("/api/x")` y
  // vise l'application elle-même, pas le serveur, et échoue SANS ERREUR
  // VISIBLE. Symptôme typique : l'interface annonce « envoyé », rien ne part.
  //
  // Cette règle existe parce que le défaut est revenu quatre fois malgré trois
  // audits : une route sous `/lovable` qu'une recherche limitée à `/api` avait
  // manquée, deux appels répartis sur plusieurs lignes, et un transport d'IA
  // configuré sur `api: "/..."`. Un audit ne tient pas dans le temps, une règle
  // si.
  //
  // Le code serveur est exclu : `src/routes/api/**` et les `*.server.ts`
  // s'exécutent sur le Worker, où un chemin relatif est légitime.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/routes/api/**",
      "src/**/*.server.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/tests/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch'] > Literal[value=/^\\//]",
          message:
            "Chemin relatif : en natif la WebView viserait le bundle embarqué. Utiliser apiUrl() de @/lib/native-platform.",
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] > TemplateLiteral[quasis.0.value.raw=/^\\//]",
          message:
            "Chemin relatif : en natif la WebView viserait le bundle embarqué. Utiliser apiUrl() de @/lib/native-platform.",
        },
        {
          selector: "Property[key.name='api'] > Literal[value=/^\\//]",
          message:
            "Transport sur chemin relatif : il échappe à serverFns.fetch et casse en natif. Utiliser apiUrl().",
        },
        {
          selector:
            "NewExpression[callee.name=/^(EventSource|WebSocket)$/] > Literal[value=/^\\//]",
          message: "Chemin relatif : utiliser apiUrl() de @/lib/native-platform.",
        },
        {
          selector: "CallExpression[callee.property.name='sendBeacon'] > Literal[value=/^\\//]",
          message: "Chemin relatif : utiliser apiUrl() de @/lib/native-platform.",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
