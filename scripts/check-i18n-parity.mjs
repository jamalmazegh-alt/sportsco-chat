#!/usr/bin/env node
/**
 * i18n parity checker.
 *
 * Walks src/locales/<lang>/<namespace>.json and verifies that every key
 * present in the reference locale (default: fr) exists in every other
 * locale. Exits with code 1 if any key is missing — wire it into CI to
 * prevent translation drift.
 *
 * Usage:
 *   node scripts/check-i18n-parity.mjs           # uses fr as reference
 *   REFERENCE_LOCALE=en node scripts/check-i18n-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");
const REFERENCE = process.env.REFERENCE_LOCALE || "fr";

function collectKeys(obj, prefix = "") {
  const out = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out.push(...collectKeys(v, next));
      } else {
        out.push(next);
      }
    }
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const locales = fs
  .readdirSync(LOCALES_DIR)
  .filter((d) => fs.statSync(path.join(LOCALES_DIR, d)).isDirectory());

if (!locales.includes(REFERENCE)) {
  console.error(`Reference locale "${REFERENCE}" not found in ${LOCALES_DIR}`);
  process.exit(2);
}

const namespaces = fs
  .readdirSync(path.join(LOCALES_DIR, REFERENCE))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

let missing = 0;
let extra = 0;

for (const ns of namespaces) {
  const refPath = path.join(LOCALES_DIR, REFERENCE, `${ns}.json`);
  const refKeys = new Set(collectKeys(readJson(refPath)));

  for (const lang of locales) {
    if (lang === REFERENCE) continue;
    const langPath = path.join(LOCALES_DIR, lang, `${ns}.json`);
    if (!fs.existsSync(langPath)) {
      console.error(`✗ [${lang}/${ns}.json] missing entire namespace`);
      missing += refKeys.size;
      continue;
    }
    const langKeys = new Set(collectKeys(readJson(langPath)));
    const miss = [...refKeys].filter((k) => !langKeys.has(k));
    const extr = [...langKeys].filter((k) => !refKeys.has(k));
    for (const k of miss) {
      console.error(`✗ [${lang}/${ns}] missing key: ${k}`);
      missing++;
    }
    for (const k of extr) {
      console.warn(`! [${lang}/${ns}] extra key (not in ${REFERENCE}): ${k}`);
      extra++;
    }
  }
}

if (missing > 0) {
  console.error(`\n${missing} missing translation key(s).`);
  process.exit(1);
}
console.log(
  `✓ i18n parity OK across ${locales.length} locales / ${namespaces.length} namespaces` +
    (extra > 0 ? ` (${extra} extra key(s) noted)` : "")
);
