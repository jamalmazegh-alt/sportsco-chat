#!/usr/bin/env node
/**
 * Ad-hoc: translate the newly added marketing keys from FR to the 6 other
 * languages (de, en, es, it, nl, pt). Targets specific paths only.
 */
import fs from "node:fs";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("Missing LOVABLE_API_KEY");
  process.exit(1);
}
const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
const URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const TARGETS = ["de", "en", "es", "it", "nl", "pt"];
const LANG_NAMES = {
  de: "German (Germany, de-DE)",
  en: "English (UK/neutral)",
  es: "Spanish (Spain, neutral Latin-friendly)",
  pt: "Portuguese (European Portuguese, pt-PT)",
  it: "Italian",
  nl: "Dutch (Netherlands, nl-NL)",
};
const NEW_FAQ_INDICES = [11, 12, 13, 14, 15];

const fr = JSON.parse(fs.readFileSync("src/locales/fr/marketing.json", "utf8"));

const PH_RE = /\{\{[^}]+\}\}|\{[a-zA-Z0-9_]+\}|%\{[^}]+\}|<\d+>|<\/?\d+>/g;
const collectStrings = (o, out = []) => {
  if (typeof o === "string") return (out.push(o), out);
  if (Array.isArray(o)) return o.forEach((v) => collectStrings(v, out)), out;
  if (o && typeof o === "object") for (const v of Object.values(o)) collectStrings(v, out);
  return out;
};
const ph = (s) => (s.match(PH_RE) || []).sort().join("|");
const structOk = (a, b) => {
  if (typeof a === "string") return typeof b === "string";
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => structOk(x, b[i]));
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object" || Array.isArray(b)) return false;
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i]) && ka.every((k) => structOk(a[k], b[k]));
  }
  return true;
};

async function callAI(messages, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages, response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 16000 }),
      });
      if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 3000 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const j = await r.json();
      const c = j.choices?.[0]?.message?.content;
      if (!c) throw new Error("empty");
      return c;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((x) => setTimeout(x, 3000 * (i + 1)));
    }
  }
}

async function translate(lang, label, payload) {
  const sys = `You are a professional sports-app localizer translating from French (FR) to ${LANG_NAMES[lang]}.
Audience: amateur sports clubs (football-first), coaches, players, parents, tournament organizers.
Rules:
- Translate ALL string VALUES naturally and idiomatically. Do NOT do word-for-word translation.
- Preserve the EXACT JSON structure: same keys, same nesting, same arrays. Do NOT add/remove/rename/reorder keys.
- Preserve placeholders {{x}}, {x}, %{x}, <0>, </0> exactly (same count/order, do not translate names).
- Keep brand names: Clubero, Stripe, HelloAsso, WhatsApp, Google, Facebook, PWA, RGPD (translate RGPD to GDPR only for English).
- For "Bientôt" translate as: DE "Bald", EN "Coming soon", ES "Próximamente", IT "Prossimamente", NL "Binnenkort", PT "Em breve".
- Output ONLY valid JSON, top-level shape {"data": <translated value>}, no commentary, no markdown.`;
  const user = `Section: ${label}\nTranslate the values of this JSON to ${LANG_NAMES[lang]}:\n\n${JSON.stringify({ data: payload })}`;
  const raw = await callAI([{ role: "system", content: sys }, { role: "user", content: user }]);
  const out = JSON.parse(raw).data;
  if (!structOk(payload, out)) throw new Error(`structure-mismatch on ${label}`);
  const s = collectStrings(payload), d = collectStrings(out);
  for (let i = 0; i < s.length; i++) if (ph(s[i]) !== ph(d[i])) throw new Error(`placeholder-mismatch on ${label}`);
  return out;
}

for (const lang of TARGETS) {
  console.log(`\n=== ${lang.toUpperCase()} ===`);
  const dstPath = `src/locales/${lang}/marketing.json`;
  const dst = JSON.parse(fs.readFileSync(dstPath, "utf8"));

  // 1. features.modules (whole subtree)
  console.log(" -- features.modules");
  dst.features = dst.features || {};
  dst.features.modules = await translate(lang, "features.modules", fr.features.modules);

  // 2. home.paymentsSoon
  console.log(" -- home.paymentsSoon");
  dst.home = dst.home || {};
  dst.home.paymentsSoon = (await translate(lang, "home.paymentsSoon", { s: fr.home.paymentsSoon })).s;

  // 3. pricing.paymentsSoonLine
  console.log(" -- pricing.paymentsSoonLine");
  dst.pricing = dst.pricing || {};
  dst.pricing.paymentsSoonLine = (await translate(lang, "pricing.paymentsSoonLine", { s: fr.pricing.paymentsSoonLine })).s;

  // 4. faq.items last 5
  console.log(" -- faq.items[11..15]");
  const newItems = NEW_FAQ_INDICES.map((i) => fr.faq.items[i]);
  const translated = await translate(lang, "faq.items", newItems);
  for (let k = 0; k < NEW_FAQ_INDICES.length; k++) dst.faq.items[NEW_FAQ_INDICES[k]] = translated[k];

  fs.writeFileSync(dstPath, JSON.stringify(dst, null, 2) + "\n");
  console.log(` ✓ wrote ${dstPath}`);
}
console.log("\nDone.");
