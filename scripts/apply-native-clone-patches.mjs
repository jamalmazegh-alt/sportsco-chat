#!/usr/bin/env node
/**
 * Apply flat key→value patches from /tmp/i18n-patches/{locale}/{ns}.json
 * onto src/locales/{locale}/{ns}.json. Only overwrites existing string leaves.
 */
import fs from "node:fs";
import path from "node:path";

const LOCALES = (process.env.TARGETS || "de,es,it,nl,pt").split(",");
const PATCH_ROOT = process.env.PATCH_ROOT || "/tmp/i18n-patches";
const LOCALES_DIR = path.resolve("src/locales");

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!cur[p] || typeof cur[p] !== "object" || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepGet(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

let applied = 0;
let skipped = 0;
for (const locale of LOCALES) {
  const dir = path.join(PATCH_ROOT, locale);
  if (!fs.existsSync(dir)) {
    console.warn(`skip missing ${dir}`);
    continue;
  }
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const ns = file.replace(/\.json$/, "");
    const patch = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const targetPath = path.join(LOCALES_DIR, locale, `${ns}.json`);
    if (!fs.existsSync(targetPath)) {
      console.warn(`missing target ${targetPath}`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    let n = 0;
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value !== "string") {
        skipped++;
        continue;
      }
      const prev = deepGet(data, key);
      if (typeof prev !== "string") {
        console.warn(`  skip non-string ${locale}/${ns}.${key}`);
        skipped++;
        continue;
      }
      deepSet(data, key, value);
      n++;
      applied++;
    }
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + "\n");
    console.log(`✓ ${locale}/${ns}.json — ${n} keys`);
  }
}
console.log(`Done. applied=${applied} skipped=${skipped}`);
