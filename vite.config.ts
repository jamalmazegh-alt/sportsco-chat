// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type ConfigEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default async function config(env: ConfigEnv) {
  const serverEnv = loadEnv(env.mode, process.cwd(), "");
  Object.assign(process.env, serverEnv);

  return defineLovableConfig({
    tanstackStart: {
      server: { entry: "server" },
    },
    vite: {
      resolve: {
        alias: {
          "entities/decode": path.resolve(
            __dirname,
            "node_modules/entities/lib/esm/decode.js",
          ),
          "entities/escape": path.resolve(
            __dirname,
            "node_modules/entities/lib/esm/escape.js",
          ),
          "entities/lib/decode.js": path.resolve(
            __dirname,
            "node_modules/entities/lib/decode.js",
          ),
          "entities/lib/encode.js": path.resolve(
            __dirname,
            "node_modules/entities/lib/encode.js",
          ),
          entities: path.resolve(__dirname, "node_modules/entities"),
        },
      },
    },
  })(env);
}
