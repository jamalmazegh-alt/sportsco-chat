#!/usr/bin/env node
/**
 * Sync tournaments.aiAssistant + createChooser.aiHint across locales.
 * Reference structure: fr. Values: per-locale overrides, then existing, then fr.
 */
import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(process.cwd(), "src/locales");
const REF = "fr";
const TARGETS = ["en", "de", "es", "it", "nl", "pt"];

const CREATE_CHOOSER_HINT = {
  fr: "Questions une par une — ton tournoi entièrement configuré.",
  en: "Step by step — your tournament fully configured.",
  de: "Schritt für Schritt — dein Turnier vollständig konfiguriert.",
  es: "Paso a paso — torneo totalmente configurado.",
  it: "Passo dopo passo — torneo completamente configurato.",
  nl: "Stap voor stap — je toernooi volledig geconfigureerd.",
  pt: "Passo a passo — torneio totalmente configurado.",
};

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

/** Merge ref structure; prefer override leaves, then target, then ref. */
function mergeAiAssistant(ref, target = {}, override = {}) {
  if (!isPlainObject(ref)) return override ?? target ?? ref;
  const out = {};
  for (const key of Object.keys(ref)) {
    const refVal = ref[key];
    const tgtVal = target[key];
    const ovrVal = override[key];
    if (isPlainObject(refVal)) {
      out[key] = mergeAiAssistant(refVal, isPlainObject(tgtVal) ? tgtVal : {}, isPlainObject(ovrVal) ? ovrVal : {});
    } else {
      out[key] = ovrVal ?? tgtVal ?? refVal;
    }
  }
  return out;
}

function loadOverrides(lang) {
  const p = path.join(process.cwd(), "scripts/i18n-patches", `${lang}.json`);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const refFile = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, REF, "tournaments.json"), "utf8"));
const refAi = refFile.aiAssistant;

for (const lang of TARGETS) {
  const filePath = path.join(LOCALES_DIR, lang, "tournaments.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const override = loadOverrides(lang);
  data.aiAssistant = mergeAiAssistant(refAi, data.aiAssistant ?? {}, override);
  data.createChooser.aiHint = CREATE_CHOOSER_HINT[lang];
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ synced ${lang}/tournaments.json`);
}
