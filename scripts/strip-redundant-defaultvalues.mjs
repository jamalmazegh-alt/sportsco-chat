#!/usr/bin/env node
/**
 * Remove defaultValue from t()/i18n.t() calls when the key already exists
 * in the FR locale (or as a plural *_one). Dry-run with --dry.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry");
const ROOT = "src/locales/fr";

function deepGet(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function loadNs(ns) {
  const p = path.join(ROOT, `${ns}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function keyExists(ns, key) {
  const j = loadNs(ns);
  if (!j) return false;
  return typeof deepGet(j, key) === "string" || typeof deepGet(j, `${key}_one`) === "string";
}

function stripDefaultValueFromObjectLiteral(objSrc) {
  // Remove `defaultValue: "..." | '...'` including optional trailing/leading commas.
  let out = objSrc;
  const re = /(,?\s*)defaultValue\s*:\s*(["'])(?:\\.|(?!\2)[\s\S])*?\2(\s*,)?/g;
  out = out.replace(re, (match, beforeComma, _q, afterComma) => {
    // Keep a comma if both sides need separation
    if (beforeComma?.includes(",") && afterComma) return ",";
    if (afterComma) return afterComma; // keep trailing comma as separator if present alone
    if (beforeComma?.includes(",")) return ""; // drop leading comma with prop
    return "";
  });
  // Clean ", }" / "{ ," artifacts
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/\{\s*,/g, "{");
  out = out.replace(/,\s*\}/g, "}");
  return out;
}

function processFile(file) {
  const src = fs.readFileSync(file, "utf8");
  let i = 0;
  let out = "";
  let removed = 0;
  while (i < src.length) {
    const idx = src.indexOf("t(", i);
    if (idx < 0) {
      out += src.slice(i);
      break;
    }
    // Support i18n.t( and t(
    let callStart = idx;
    if (idx >= 5 && src.slice(idx - 5, idx) === "i18n.") callStart = idx - 5;
    out += src.slice(i, callStart);
    const fn = src.slice(callStart, idx + 2); // "t(" or "i18n.t("
    const after = src.slice(idx + 2).match(/^\s*(["'])/);
    if (!after) {
      out += fn;
      i = idx + 2;
      continue;
    }
    const q = after[1];
    let p = idx + 2 + after[0].length;
    let key = "";
    while (p < src.length && src[p] !== q) {
      if (src[p] === "\\") {
        key += src[p] + (src[p + 1] || "");
        p += 2;
        continue;
      }
      key += src[p++];
    }
    if (src[p] !== q) {
      out += fn;
      i = idx + 2;
      continue;
    }
    const keyEnd = p + 1;
    let scan = keyEnd;
    while (scan < src.length && /\s/.test(src[scan])) scan++;
    if (src[scan] !== ",") {
      out += src.slice(callStart, keyEnd);
      i = keyEnd;
      continue;
    }
    scan++;
    while (scan < src.length && /\s/.test(src[scan])) scan++;
    if (src[scan] !== "{") {
      out += src.slice(callStart, keyEnd);
      i = keyEnd;
      continue;
    }
    let depth = 0;
    const objStart = scan;
    let objEnd = scan;
    while (objEnd < src.length) {
      const c = src[objEnd];
      if (c === '"' || c === "'") {
        const qq = c;
        objEnd++;
        while (objEnd < src.length && src[objEnd] !== qq) {
          if (src[objEnd] === "\\") objEnd += 2;
          else objEnd++;
        }
        objEnd++;
        continue;
      }
      if (c === "`") {
        objEnd++;
        while (objEnd < src.length && src[objEnd] !== "`") {
          if (src[objEnd] === "\\") objEnd += 2;
          else objEnd++;
        }
        objEnd++;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          objEnd++;
          break;
        }
      }
      objEnd++;
    }
    const objSrc = src.slice(objStart, objEnd);
    if (!/defaultValue\s*:/.test(objSrc)) {
      out += src.slice(callStart, objEnd);
      i = objEnd;
      continue;
    }
    const nsMatch = key.match(/^([\w-]+):(.+)$/);
    const ns = nsMatch ? nsMatch[1] : "common";
    const k = nsMatch ? nsMatch[2] : key;
    if (!keyExists(ns, k)) {
      out += src.slice(callStart, objEnd);
      i = objEnd;
      continue;
    }
    const cleaned = stripDefaultValueFromObjectLiteral(objSrc);
    // If object becomes empty `{}`, drop the second arg entirely
    if (/^\{\s*\}$/.test(cleaned)) {
      out += `${fn}${q}${key}${q}`;
    } else {
      const between = src.slice(keyEnd, objStart); // ", " typically
      out += `${fn}${q}${key}${q}${between}${cleaned}`;
    }
    removed++;
    i = objEnd;
  }
  if (removed > 0 && !DRY) fs.writeFileSync(file, out);
  return removed;
}

const SKIP = new Set([
  "src/lib/humanize-error.ts", // needs defaultValue fallbacks outside i18n init (unit tests)
]);
const files = execSync(
  `rg -l --glob '*.{tsx,ts}' "defaultValue\\s*:" src --glob '!src/lib/email-templates/**'`,
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((f) => !SKIP.has(f));

let total = 0;
for (const f of files) {
  const n = processFile(f);
  if (n) {
    console.log(`${DRY ? "DRY " : ""}${f}: ${n}`);
    total += n;
  }
}
console.log(
  `${DRY ? "Would remove" : "Removed"} ${total} defaultValue(s) across ${files.length} files`,
);
