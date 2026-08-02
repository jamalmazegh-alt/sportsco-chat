#!/usr/bin/env node
/**
 * Génère une requête SQL qui dit, migration par migration, si elle est en base.
 *
 * Pourquoi pas `supabase_migrations.schema_migrations` ? Parce qu'elle ment sur
 * ce projet : vérifié le 02/08/2026 en prod, elle ne contient QUE les migrations
 * créées par Lovable (nommées par hash). Les migrations ajoutées à la main sont
 * absentes de la table alors que leur contenu est bel et bien appliqué — Lovable
 * exécute leur SQL sans enregistrer la version.
 *
 * On vérifie donc par objets. Le piège, rencontré sur la docuthèque : deux
 * fonctions existaient en prod, mais écrites par une AUTRE migration ; celle qui
 * les portait n'avait jamais tourné. Chercher un objet partagé ne prouve rien.
 *
 * D'où la règle appliquée ici : pour chaque migration, ne retenir qu'un objet
 * qu'elle est **la seule** du dépôt à définir. Sa présence devient alors une
 * preuve, et non un indice.
 *
 * Le script ne se connecte à rien : il imprime une requête à coller dans le SQL
 * Editor. Aucun identifiant, valable pour la prod comme pour un projet de test.
 *
 * Usage :
 *   node scripts/check-migrations-applied.mjs --since 20260701
 *   node scripts/check-migrations-applied.mjs                  # tout le dépôt
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
);

const sinceIdx = process.argv.indexOf("--since");
const since = sinceIdx === -1 ? null : process.argv[sinceIdx + 1];
if (sinceIdx !== -1 && !/^\d{8,14}$/.test(since ?? "")) {
  console.error("--since attend un horodatage, par exemple 20260701");
  process.exit(1);
}

/**
 * Objets créés par une migration, avec le test SQL correspondant.
 *
 * On ignore volontairement `CREATE OR REPLACE` sur les fonctions quand une autre
 * migration touche la même : c'est exactement le cas qui produit un faux positif.
 * Le dédoublonnage plus bas s'en charge, sans avoir à distinguer ici.
 */
function extractObjects(sql) {
  const found = [];
  const add = (kind, name, test) => found.push({ kind, name, test });
  const clean = (s) =>
    s
      .replace(/"/g, "")
      .replace(/^public\./i, "")
      .trim();

  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi)) {
    const n = clean(m[1]);
    add("table", n, `to_regclass('public.${n}') is not null`);
  }
  for (const m of sql.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi,
  )) {
    const n = clean(m[1]);
    add("index", n, `to_regclass('public.${n}') is not null`);
  }
  for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)/gi)) {
    const n = clean(m[1]);
    add(
      "function",
      n,
      `exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace ` +
        `where ns.nspname = 'public' and p.proname = '${n}')`,
    );
  }
  for (const m of sql.matchAll(/CREATE\s+POLICY\s+"?([\w\s.-]+?)"?\s+ON\s/gi)) {
    const n = m[1].trim();
    add("policy", n, `exists (select 1 from pg_policies where policyname = ${lit(n)})`);
  }
  for (const m of sql.matchAll(/CREATE\s+TRIGGER\s+([\w."]+)/gi)) {
    const n = clean(m[1]);
    add("trigger", n, `exists (select 1 from pg_trigger where tgname = '${n}')`);
  }
  for (const m of sql.matchAll(
    /ALTER\s+TYPE\s+([\w."]+)\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'/gi,
  )) {
    const t = clean(m[1]);
    add(
      "enum",
      `${t}=${m[2]}`,
      `exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid ` +
        `where ty.typname = '${t}' and e.enumlabel = '${m[2]}')`,
    );
  }
  // Seeds : `INSERT INTO t (cols) VALUES (...) ON CONFLICT (k1, k2) DO NOTHING`.
  // La clause ON CONFLICT nomme la clé naturelle — on s'en sert comme identité
  // plutôt que de deviner quelles colonnes distinguent une ligne.
  for (const m of sql.matchAll(
    /INSERT\s+INTO\s+([\w."]+)\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?)ON\s+CONFLICT\s*\(([^)]+)\)/gi,
  )) {
    const table = clean(m[1]);
    const cols = m[2].split(",").map((c) => clean(c).toLowerCase());
    const keys = m[4].split(",").map((c) => clean(c).toLowerCase());
    const idx = keys.map((k) => cols.indexOf(k));
    if (idx.some((i) => i === -1)) continue;

    // Premier tuple seulement, et uniquement ses littéraux de tête : au-delà,
    // les colonnes contiennent du markdown multiligne impossible à découper
    // sans un vrai parseur.
    const head = m[3].slice(m[3].indexOf("("));
    const lits = [...head.matchAll(/'((?:[^']|'')*)'|\b(\d+)\b|\b(true|false)\b/gi)]
      .slice(0, Math.max(...idx) + 1)
      .map((x) => x[1] ?? x[2] ?? x[3]);
    if (lits.length <= Math.max(...idx)) continue;

    const where = keys
      .map((k, i) => `${k}::text = ${lit(lits[idx[i]].replace(/''/g, "'"))}`)
      .join(" and ");
    add(
      "seed",
      `${table}(${idx.map((i) => lits[i]).join(",")})`,
      `exists (select 1 from public.${table} where ${where})`,
    );
  }

  return found;
}

/** Échappe une chaîne pour SQL (les apostrophes se doublent). */
function lit(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// Passe 1 : qui définit quoi, sur TOUT le dépôt — le partage se juge
// globalement, pas seulement dans la plage demandée.
const owners = new Map(); // "kind:name" -> Set(version)
const perFile = new Map(); // version -> objets
for (const f of files) {
  const version = f.split("_")[0];
  if (!/^\d{14}$/.test(version)) continue;
  const objs = extractObjects(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  perFile.set(version, objs);
  for (const o of objs) {
    const key = `${o.kind}:${o.name}`;
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key).add(version);
  }
}

// Passe 2 : ne garder qu'une signature exclusive par migration.
const checks = [];
const unverifiable = [];
for (const [version, objs] of perFile) {
  if (since && version < since.padEnd(14, "0")) continue;
  const exclusive = objs.find((o) => owners.get(`${o.kind}:${o.name}`).size === 1);
  if (exclusive) {
    checks.push({ version, ...exclusive });
  } else {
    unverifiable.push(version);
  }
}

if (checks.length === 0) {
  console.error("Aucune migration vérifiable dans cette plage.");
  process.exit(1);
}

const lines = checks
  .map(
    (c) =>
      `  select ${lit(c.version)} as migration, ${lit(`${c.kind} ${c.name}`)} as preuve, ` +
      `(${c.test}) as applique`,
  )
  .join("\nunion all\n");

console.log(`-- ${checks.length} migration(s) vérifiable(s)${since ? ` depuis ${since}` : ""}.
-- Chaque ligne teste un objet que SEULE cette migration crée dans le dépôt :
-- sa présence est une preuve, pas un indice.
-- Ne PAS se fier à supabase_migrations.schema_migrations sur ce projet :
-- elle n'enregistre que les migrations créées par Lovable.
select * from (
${lines}
) t
where not applique          -- retirer cette ligne pour voir le détail complet
order by migration;`);

if (unverifiable.length > 0) {
  console.error(
    `\n// ${unverifiable.length} migration(s) sans objet exclusif, non couverte(s) :\n` +
      `// ${unverifiable.join(", ")}\n` +
      `// (elles ne font que modifier des objets partagés — à vérifier à la main)`,
  );
}
