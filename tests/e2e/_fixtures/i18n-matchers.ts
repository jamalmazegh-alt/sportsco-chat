/**
 * Multilingual Playwright matchers built from real `src/locales` JSON.
 * Kept free of admin/env imports so unit tests can import it safely.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "../../../src/locales");
const LANGS = ["fr", "en", "de", "es", "it", "nl", "pt"] as const;

export type Ns =
  | "common"
  | "marketing"
  | "support"
  | "tournaments"
  | "publications"
  | "needs"
  | "camps"
  | "challenges"
  | "buildClubero";

const cache = new Map<string, Record<string, unknown>>();

function load(lng: string, ns: Ns): Record<string, unknown> {
  const k = `${lng}/${ns}`;
  if (!cache.has(k)) {
    try {
      cache.set(k, JSON.parse(readFileSync(path.join(LOCALES_DIR, lng, `${ns}.json`), "utf8")));
    } catch {
      cache.set(k, {});
    }
  }
  return cache.get(k)!;
}

function resolve(obj: Record<string, unknown>, dotted: string): string | undefined {
  let cur: unknown = obj;
  for (const part of dotted.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stablePart(s: string): string {
  const parts = s
    .split(/\{\{[^}]+\}\}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.sort((a, b) => b.length - a.length)[0] ?? s;
}

export function tx(key: string, ns: Ns = "common"): RegExp {
  const variants = new Set<string>();
  for (const lng of LANGS) {
    const v = resolve(load(lng, ns), key);
    if (v) variants.add(escapeRe(stablePart(v)));
  }
  if (variants.size === 0) {
    throw new Error(
      `tx(): aucune traduction pour "${key}" (ns "${ns}"). ` +
        `Soit la clé n'existe pas, soit elle n'est fournie qu'en defaultValue ` +
        `dans le code — dans ce cas utiliser txOr("${key}", "<valeur FR>", "${ns}").`,
    );
  }
  return new RegExp(`(${[...variants].join("|")})`, "i");
}

export function txOr(key: string, ...rest: string[]): RegExp {
  const known: Ns[] = [
    "common",
    "marketing",
    "support",
    "tournaments",
    "publications",
    "needs",
    "camps",
    "challenges",
    "buildClubero",
  ];
  const maybeNs = rest[rest.length - 1] as Ns;
  const ns: Ns = known.includes(maybeNs) ? maybeNs : "common";
  const fallbacks = known.includes(maybeNs) ? rest.slice(0, -1) : rest;

  const variants = new Set<string>();
  for (const lng of LANGS) {
    const v = resolve(load(lng, ns), key);
    if (v) variants.add(escapeRe(stablePart(v)));
  }
  for (const f of fallbacks) variants.add(escapeRe(stablePart(f)));
  if (variants.size === 0) {
    throw new Error(`txOr(): ni traduction ni fallback pour "${key}".`);
  }
  return new RegExp(`(${[...variants].join("|")})`, "i");
}
