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
  // Journaux JS conservés en build de release : par défaut Capacitor les
  // supprime hors debug, rendant une build TestFlight totalement muette.
  // Constaté en cherchant la cause d'un échec d'activation des
  // notifications sur iPhone — aucune console ne montrait rien.
  loggingBehavior: "production",
  android: {
    // `false` depuis que l'API de production est en HTTPS (https://clubero.app) :
    // la WebView, servie en https://localhost, n'a plus de contenu mixte à
    // charger. Le laisser à `true` affaiblirait le build de distribution.
    //
    // Pour un build de développement visant le serveur local en HTTP sur
    // 10.0.2.2, repasser temporairement à `true` — le trafic en clair est par
    // ailleurs autorisé, et uniquement en debug, par `android/app/src/debug/`.
    allowMixedContent: false,
  },
};

export default config;
