#!/usr/bin/env node
/**
 * Bulk translator: DE → ES/PT/IT/NL via Lovable AI Gateway.
 * Preserves keys, nesting, placeholders ({{x}}, {x}, %{x}, <0>).
 * Translates per top-level section. Skips sections already present
 * unless --force.
 */
import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) { console.error("Missing LOVABLE_API_KEY"); process.exit(1); }

const MODEL = process.env.MODEL || "google/gemini-2.5-flash";
const URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SRC_DIR = "src/locales/de";
const TARGETS = (process.env.TARGETS || "es,pt,it,nl").split(",");
const NAMESPACES = (process.env.NS || "common,marketing,support,tournaments").split(",");
const FORCE = process.argv.includes("--force");

const LANG_NAMES = {
  es: "Spanish (Spain, neutral Latin-friendly)",
  pt: "Portuguese (European Portuguese — pt-PT)",
  it: "Italian",
  nl: "Dutch (Netherlands — nl-NL)",
};

const SPORTS_GLOSSARY = {
  es: { Club:"Club", Team:"Equipo", Player:"Jugador", Coach:"Entrenador", "Assistant Coach":"Entrenador asistente", Parent:"Padre/Madre", Referee:"Árbitro", Tournament:"Torneo", "Group Stage":"Fase de grupos", "Knockout Stage":"Fase eliminatoria", Standings:"Clasificación", Lineup:"Alineación", Roster:"Convocatoria", Suspension:"Sanción", Availability:"Disponibilidad", Attendance:"Asistencia" },
  pt: { Club:"Clube", Team:"Equipa", Player:"Jogador", Coach:"Treinador", "Assistant Coach":"Treinador adjunto", Parent:"Encarregado de educação", Referee:"Árbitro", Tournament:"Torneio", "Group Stage":"Fase de grupos", "Knockout Stage":"Fase a eliminar", Standings:"Classificação", Lineup:"Onze inicial", Roster:"Convocatória", Suspension:"Suspensão", Availability:"Disponibilidade", Attendance:"Presenças" },
  it: { Club:"Club", Team:"Squadra", Player:"Giocatore", Coach:"Allenatore", "Assistant Coach":"Vice allenatore", Parent:"Genitore", Referee:"Arbitro", Tournament:"Torneo", "Group Stage":"Fase a gironi", "Knockout Stage":"Fase a eliminazione diretta", Standings:"Classifica", Lineup:"Formazione", Roster:"Convocati", Suspension:"Squalifica", Availability:"Disponibilità", Attendance:"Presenze" },
  nl: { Club:"Club", Team:"Team", Player:"Speler", Coach:"Coach", "Assistant Coach":"Assistent-coach", Parent:"Ouder", Referee:"Scheidsrechter", Tournament:"Toernooi", "Group Stage":"Groepsfase", "Knockout Stage":"Knock-outfase", Standings:"Stand", Lineup:"Opstelling", Roster:"Selectie", Suspension:"Schorsing", Availability:"Beschikbaarheid", Attendance:"Aanwezigheid" },
};

const PH_RE = /\{\{[^}]+\}\}|\{[a-zA-Z0-9_]+\}|%\{[^}]+\}|<\d+>|<\/?\d+>/g;

function collectStrings(obj, out=[]) {
  if (typeof obj === "string") { out.push(obj); return out; }
  if (Array.isArray(obj)) { obj.forEach(v=>collectStrings(v,out)); return out; }
  if (obj && typeof obj === "object") for (const v of Object.values(obj)) collectStrings(v,out);
  return out;
}
function placeholders(s){ return (s.match(PH_RE)||[]).sort(); }
function structurallyEqual(a,b){
  if (typeof a==="string") return typeof b==="string";
  if (Array.isArray(a)) return Array.isArray(b) && a.length===b.length && a.every((x,i)=>structurallyEqual(x,b[i]));
  if (a && typeof a==="object") {
    if (!b || typeof b!=="object" || Array.isArray(b)) return false;
    const ka=Object.keys(a).sort(), kb=Object.keys(b).sort();
    if (ka.length!==kb.length || ka.some((k,i)=>k!==kb[i])) return false;
    return ka.every(k=>structurallyEqual(a[k],b[k]));
  }
  return a===b;
}

async function callAI(messages, retries=3) {
  for (let i=0;i<retries;i++){
    try {
      const r = await fetch(URL, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages, response_format:{type:"json_object"}, temperature:0.2 }),
      });
      if (r.status===429 || r.status>=500) { await new Promise(r=>setTimeout(r, 2000*(i+1))); continue; }
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      const j = await r.json();
      return j.choices[0].message.content;
    } catch(e){ if (i===retries-1) throw e; await new Promise(r=>setTimeout(r, 2000*(i+1))); }
  }
}

async function translateSection(lang, ns, sectionKey, sectionValue) {
  const glossary = SPORTS_GLOSSARY[lang];
  const sys = `You are a professional sports-app localizer translating from German (DE) to ${LANG_NAMES[lang]}.
Audience: amateur sports clubs (football-first), coaches, players, parents, tournament organizers.
Rules:
- Translate ALL string VALUES naturally and idiomatically. Do NOT do word-for-word translation.
- Preserve the EXACT JSON structure: same keys, same nesting, same arrays, same booleans/numbers/null.
- Preserve ALL placeholders exactly: {{count}}, {{name}}, {count}, %{x}, <0>, </0>, etc. Do not translate placeholder names. Keep their count and order.
- Preserve plural suffixes (e.g. *_one, *_other, *_zero, *_few, *_many) as KEYS — they are i18next plural keys, do not rename.
- Keep emojis, punctuation style appropriate for the target language. Use language-correct quotation marks where natural in body text.
- Keep brand names: Clubero, Stripe, WhatsApp, Google.
- Sports terminology must follow this glossary: ${JSON.stringify(glossary)}
- Output ONLY valid JSON, no commentary. Top-level shape MUST be {"${sectionKey}": <translated value>}.`;

  const user = `Namespace: ${ns}\nSection key: ${sectionKey}\nTranslate the values of this JSON to ${LANG_NAMES[lang]}:\n\n${JSON.stringify({[sectionKey]: sectionValue})}`;

  const raw = await callAI([{role:"system",content:sys},{role:"user",content:user}]);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`Bad JSON for ${lang}/${ns}/${sectionKey}: ${raw.slice(0,200)}`); }
  const out = parsed[sectionKey] ?? parsed;
  if (!structurallyEqual(sectionValue, out)) throw new Error(`Structure mismatch ${lang}/${ns}/${sectionKey}`);
  // Placeholder check
  const srcStrs = collectStrings(sectionValue);
  const dstStrs = collectStrings(out);
  for (let i=0;i<srcStrs.length;i++){
    const a=placeholders(srcStrs[i]).join("|"), b=placeholders(dstStrs[i]).join("|");
    if (a!==b) throw new Error(`Placeholder mismatch ${lang}/${ns}/${sectionKey} string#${i}: [${a}] vs [${b}] — "${dstStrs[i]}"`);
  }
  return out;
}

async function processLangNs(lang, ns) {
  const srcPath = path.join(SRC_DIR, `${ns}.json`);
  const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const dstDir = `src/locales/${lang}`;
  fs.mkdirSync(dstDir, {recursive:true});
  const dstPath = path.join(dstDir, `${ns}.json`);
  let existing = {};
  if (fs.existsSync(dstPath)) { try { existing = JSON.parse(fs.readFileSync(dstPath,"utf8")); } catch {} }
  const result = { ...existing };
  const sections = Object.keys(src);
  // Translate in small parallel batches to avoid rate limits
  const BATCH = 4;
  for (let i=0;i<sections.length;i+=BATCH) {
    const slice = sections.slice(i, i+BATCH);
    const out = await Promise.all(slice.map(async key => {
      if (!FORCE && key in existing && structurallyEqual(src[key], existing[key])) {
        return [key, existing[key], "skip"];
      }
      const t = await translateSection(lang, ns, key, src[key]);
      return [key, t, "ok"];
    }));
    for (const [k,v,status] of out) {
      result[k]=v;
      process.stdout.write(`  ${lang}/${ns}/${k} ${status}\n`);
    }
    fs.writeFileSync(dstPath, JSON.stringify(result, null, 2)+"\n");
  }
}

(async () => {
  for (const lang of TARGETS) {
    console.log(`\n=== ${lang.toUpperCase()} ===`);
    for (const ns of NAMESPACES) {
      console.log(` -- ${ns}`);
      await processLangNs(lang, ns);
    }
  }
  console.log("\nDone.");
})().catch(e => { console.error(e); process.exit(1); });
