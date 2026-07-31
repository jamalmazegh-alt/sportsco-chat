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
  plugins: {
    SplashScreen: {
      // Sans ceci, le splash s'auto-masque après le délai par défaut — donc
      // avant que React n'ait monté — et l'utilisateur voit un écran blanc.
      // On le garde affiché jusqu'à `SplashScreen.hide()` dans native-shell.ts.
      launchAutoHide: false,
    },
  },
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
    // La WebView est servie en https://localhost et le serveur de dev en HTTP
    // sur 10.0.2.2 : sans ceci, la WebView bloque ces requêtes comme contenu
    // mixte. Le blocage du trafic en clair est traité séparément et de façon
    // restreinte par `android/app/src/debug/` (debug uniquement).
    //
    // ⚠️ À REPASSER À `false` AU LOT 6 : en production l'API sera en HTTPS,
    // ce drapeau n'aura plus d'utilité et affaiblirait le build de release.
    allowMixedContent: true,
  },
};

export default config;
