// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { defaultAllowedOrigins, loadEnv, type ConfigEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default async function config(env: ConfigEnv) {
  const serverEnv = loadEnv(env.mode, process.cwd(), "");
  Object.assign(process.env, serverEnv);

  // Build mobile (Capacitor) : produit un shell SPA statique à embarquer dans
  // l'app, le Worker Cloudflare restant le backend distant. Strictement opt-in —
  // `bun run build` et le build Lovable/Cloudflare ne définissent jamais cette
  // variable, et conservent donc le SSR à l'identique.
  const isMobileBuild = process.env.MOBILE_BUILD === "1";

  return defineLovableConfig({
    // Le build mobile n'a pas de serveur : c'est un shell statique embarqué dans
    // l'app, le Worker restant le backend distant. Nitro force la sortie vers
    // `.output/{server,public}` (layout Cloudflare), alors que le prérendu du
    // mode SPA attend le layout standard `dist/{client,server}` — d'où un
    // ERR_MODULE_NOT_FOUND sur `dist/server/server.js` au prérendu.
    // Désactiver Nitro lève le conflit et supprime un artefact inutile ici.
    ...(isMobileBuild ? { nitro: false as const } : {}),
    tanstackStart: {
      server: { entry: "server" },
      // `outputPath: "/index"` : le shell est écrit en `index.html`, le point
      // d'entrée que Capacitor charge depuis `webDir` (défaut : `/_shell`).
      ...(isMobileBuild ? { spa: { enabled: true, prerender: { outputPath: "/index" } } } : {}),
    },
    vite: {
      // Cible de compilation du build mobile.
      //
      // Vite 7 vise par défaut « baseline widely available », soit Chrome 107+.
      // Or les WebView Android ne suivent pas la version d'Android : un Galaxy
      // S10 sous Android 11 tourne en WebView 83 (2020) si l'utilisateur ne l'a
      // jamais mise à jour — cas constaté sur un vrai appareil. Le bundle y
      // échouait à l'analyse (`??=`, `.at()`, `Object.hasOwn`,
      // `structuredClone`), React ne montait jamais et l'app restait figée sur
      // le splash.
      //
      // `chrome80` couvre les WebView livrées avec Android 10 et suivantes.
      // Le build web n'est pas concerné : sa cible reste celle de Vite.
      ...(isMobileBuild ? { build: { target: "chrome80" } } : {}),
      // Dev uniquement (le serveur Vite n'existe pas en prod) : autorise la
      // WebView Capacitor du spike mobile à appeler le serveur de dev.
      // `defaultAllowedOrigins` (regex localhost de Vite) est conservé — cette
      // liste est un sur-ensemble strict du comportement par défaut.
      server: {
        cors: { origin: [defaultAllowedOrigins, "capacitor://localhost"] },
      },
      preview: {
        cors: { origin: [defaultAllowedOrigins, "capacitor://localhost"] },
      },
      plugins: [mcpPlugin()],
      resolve: {
        alias: {
          "entities/decode": path.resolve(__dirname, "node_modules/entities/lib/esm/decode.js"),
          "entities/escape": path.resolve(__dirname, "node_modules/entities/lib/esm/escape.js"),
          "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
          "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
          entities: path.resolve(__dirname, "node_modules/entities"),
        },
      },
    },
  })(env);
}
