#!/usr/bin/env node
/**
 * Démarre le serveur de dev câblé sur l'env QA bughunt (NON-PROD, jetable).
 *
 * Pourquoi un loader explicite :
 *  - Les server functions lisent process.env.SUPABASE_* (non-VITE). On les
 *    injecte ici AVANT de lancer Vite, donc le serveur vise bien bughunt.
 *  - Le client lit VITE_SUPABASE_* : on lance Vite en `--mode qa` pour que
 *    le fichier .env.qa prime sur .env (racine = PROD).
 *  - Garde-fou dur : refus de démarrer si la cible ressemble à la PROD.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.qa");

let raw;
try {
  raw = readFileSync(envPath, "utf8");
} catch {
  console.error(`[dev:qa] .env.qa introuvable (${envPath}). Abandon.`);
  process.exit(1);
}

for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  // .env.qa prime sur le .env racine (PROD).
  process.env[key] = val;
}

// Garde-fou : ne jamais démarrer la "QA" si elle pointe sur la PROD connue.
const PROD_REF = "woawmhuntajpiezmmgzm";
const clientUrl = process.env.VITE_SUPABASE_URL || "";
const serverUrl = process.env.SUPABASE_URL || "";
if (clientUrl.includes(PROD_REF) || serverUrl.includes(PROD_REF)) {
  console.error("[dev:qa] REFUS: .env.qa vise la PROD. Vérifie les URLs. Abandon.");
  process.exit(1);
}
if (!clientUrl || !serverUrl) {
  console.error("[dev:qa] REFUS: SUPABASE_URL / VITE_SUPABASE_URL manquants dans .env.qa.");
  process.exit(1);
}

const port = process.env.QA_PORT || "8081";
console.log(`[dev:qa] Cible Supabase (client): ${clientUrl}`);
console.log(`[dev:qa] Cible Supabase (server): ${serverUrl}`);
console.log(`[dev:qa] Démarrage Vite sur :${port} (mode qa)…`);

const child = spawn(
  "npx",
  ["vite", "dev", "--mode", "qa", "--port", port, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env, cwd: root },
);
child.on("exit", (code) => process.exit(code ?? 0));
