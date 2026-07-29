import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configuration Capacitor.
 *
 * `webDir` pointe sur le shell SPA produit par `bun run build:mobile`. Le backend
 * (server functions + /api) reste distant : voir `VITE_API_ORIGIN` et la
 * réécriture d'URL dans `src/start.ts`.
 *
 * Pendant le spike, l'app vise le serveur de dev local câblé sur le Supabase QA
 * bughunt (`bun run dev:qa`) — jamais la production. Le simulateur iOS atteint
 * `localhost` directement ; l'émulateur Android passe par `10.0.2.2`.
 */
const config: CapacitorConfig = {
  appId: "app.clubero.mobile",
  appName: "Clubero",
  webDir: "dist/client",
  server: {
    // Défaut de Capacitor depuis la 1.2, épinglé ici parce que l'allowlist CORS
    // du Worker (`src/server.ts`) en dépend : ce schéma détermine l'origine
    // envoyée par la WebView Android, soit `https://localhost`.
    androidScheme: "https",
  },
  ios: {
    contentInset: "always",
  },
  android: {
    // Autorise le HTTP en clair vers le serveur de dev local uniquement.
    // À repasser à `false` avant tout build de distribution.
    allowMixedContent: true,
  },
};

export default config;
