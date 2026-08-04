#!/usr/bin/env node
/**
 * i18n missing-key checker.
 *
 * Parity (check-i18n-parity.mjs) proves the locale files agree with each other.
 * It cannot see a key that exists in *no* locale: every language is equally
 * empty, so nothing is out of step. Those keys are the dangerous ones — when a
 * `t()` call carries a French defaultValue, the app silently ships French to
 * every language and no check goes red. That is how ~58 strings, including the
 * whole public /players directory, reached production.
 *
 * This script closes that hole from the other side: it walks the source,
 * collects every statically-resolvable translation key, and verifies each one
 * exists in the reference locale. Exits 1 on any miss.
 *
 * Covers:
 *   t("key")                          -> namespace(s) from useTranslation(...)
 *   t("ns:key")                       -> explicit namespace
 *   t("key", { ns: "x" })             -> namespace from options
 *   i18n.t("key")                     -> DEFAULT_NS
 *   const { t: alias } = useTranslation("ns"); alias("key")
 *   <Trans i18nKey="key" />           -> namespace(s) from useTranslation(...)
 *   plural/context suffixes (key_one, key_other, key_<ctx>)
 *
 * Deliberately not covered (reported as skipped, never as failures):
 *   template-literal keys such as t(`roles.${role}`) — not statically knowable.
 *
 * Usage:
 *   node scripts/check-i18n-missing-keys.mjs
 *   REFERENCE_LOCALE=en node scripts/check-i18n-missing-keys.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.resolve(process.cwd(), "src");
const LOCALES_DIR = path.join(SRC_DIR, "locales");
const REFERENCE = process.env.REFERENCE_LOCALE || "fr";
const DEFAULT_NS = "common";
const PLURAL_SUFFIXES = ["", "_one", "_other", "_zero", "_two", "_few", "_many"];

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const refDir = path.join(LOCALES_DIR, REFERENCE);
if (!fs.existsSync(refDir)) {
  console.error(`Reference locale "${REFERENCE}" not found in ${LOCALES_DIR}`);
  process.exit(2);
}

/** namespace -> flat key map of the reference locale */
const catalog = {};
for (const file of fs.readdirSync(refDir)) {
  if (!file.endsWith(".json")) continue;
  catalog[file.replace(/\.json$/, "")] = flatten(
    JSON.parse(fs.readFileSync(path.join(refDir, file), "utf8")),
  );
}

/** A key resolves if it exists plainly, or under any plural/context suffix. */
function resolves(ns, key) {
  const table = catalog[ns];
  if (!table) return false;
  if (PLURAL_SUFFIXES.some((s) => key + s in table)) return true;
  return Object.keys(table).some((k) => k.startsWith(`${key}_`));
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "locales") continue;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * Namespaces a bare `t("key")` may resolve against in this file, plus any
 * aliased translator names (`const { t: tc } = useTranslation("common")`).
 */
function fileNamespaces(src) {
  const declared = [];
  const aliases = new Map();
  const re = /(?:const|let)\s*\{([^}]*)\}\s*=\s*useTranslation\(\s*([^)]*?)\s*\)/g;
  for (const m of src.matchAll(re)) {
    const names = [...m[2].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
    const list = names.length ? names : [DEFAULT_NS];
    declared.push(...list);
    const aliasMatch = m[1].match(/\bt\s*:\s*(\w+)/);
    if (aliasMatch) aliases.set(aliasMatch[1], list);
  }
  return { declared: declared.length ? [...new Set(declared)] : [DEFAULT_NS], aliases };
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

/**
 * Blank out comments, preserving byte offsets and newlines so reported line
 * numbers stay accurate. Docs that mention a key (`t('needs.templates.<key>')`)
 * must not be mistaken for call sites.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
}

const missing = [];
let dynamicSkipped = 0;
let checked = 0;

for (const file of walk(SRC_DIR)) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const { declared, aliases } = fileNamespaces(src);
  const rel = path.relative(process.cwd(), file);

  // Translator calls: t(...), i18n.t(...), and any aliased translator.
  const callNames = ["t", "i18n\\.t", ...aliases.keys()].join("|");
  const callRe = new RegExp(`\\b(${callNames})\\(\\s*(["'])([^"'\`$]*?)\\2\\s*([,)])`, "g");

  for (const m of src.matchAll(callRe)) {
    const callee = m[1];
    const raw = m[3];
    if (!raw.trim()) continue;

    let ns = null;
    let key = raw;
    if (raw.includes(":")) {
      ns = raw.slice(0, raw.indexOf(":"));
      key = raw.slice(raw.indexOf(":") + 1);
    }

    // A `{ ns: "x" }` option overrides the hook namespace.
    let optionNs = null;
    if (m[4] === ",") {
      const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 400).trimStart();
      const found = tail.match(/^\{[\s\S]{0,400}?\bns\s*:\s*["']([^"']+)["']/);
      if (found) optionNs = found[1];
    }

    let candidates;
    if (ns) candidates = [ns];
    else if (optionNs) candidates = [optionNs];
    else if (aliases.has(callee)) candidates = aliases.get(callee);
    else if (callee === "i18n.t") candidates = [DEFAULT_NS];
    else candidates = declared;

    checked++;
    if (!candidates.some((n) => resolves(n, key))) {
      missing.push({ file: rel, line: lineOf(src, m.index), ns: candidates.join("|"), key });
    }
  }

  // <Trans i18nKey="..."> resolves like a bare t() call.
  for (const m of src.matchAll(/i18nKey\s*=\s*"([^"{}$]+)"/g)) {
    const raw = m[1];
    let ns = null;
    let key = raw;
    if (raw.includes(":")) {
      ns = raw.slice(0, raw.indexOf(":"));
      key = raw.slice(raw.indexOf(":") + 1);
    }
    const candidates = ns ? [ns] : declared;
    checked++;
    if (!candidates.some((n) => resolves(n, key))) {
      missing.push({ file: rel, line: lineOf(src, m.index), ns: candidates.join("|"), key });
    }
  }

  dynamicSkipped += [...src.matchAll(/\b(?:i18n\.)?t\(\s*`[^`]*\$\{/g)].length;
}

if (missing.length) {
  console.error(`✗ ${missing.length} translation key(s) referenced in code but absent from`);
  console.error(`  src/locales/${REFERENCE}/. They render the raw key, or a hardcoded`);
  console.error(`  defaultValue in one language, for every user.\n`);
  for (const m of missing) {
    console.error(`✗ ${m.file}:${m.line} — ${m.ns}:${m.key}`);
  }
  console.error(`\nAdd each key to src/locales/<lang>/<namespace>.json for all locales.`);
  process.exit(1);
}

console.log(
  `✓ i18n keys OK — ${checked} static key reference(s) all resolve in "${REFERENCE}"` +
    (dynamicSkipped > 0 ? ` (${dynamicSkipped} dynamic key(s) skipped)` : ""),
);
