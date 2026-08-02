#!/usr/bin/env node
/**
 * Génère une requête SQL qui liste les migrations du dépôt absentes d'une base.
 *
 * Supabase enregistre chaque migration appliquée dans la table
 * `supabase_migrations.schema_migrations`, dont la colonne `version` est le
 * préfixe horodaté du nom de fichier. Comparer cette table au dossier
 * `supabase/migrations/` est la seule vérification exhaustive : chercher un
 * objet (table, fonction, index) ne prouve rien, car un même objet peut avoir
 * été créé par une autre migration — c'est arrivé sur la docuthèque, où deux
 * fonctions existaient bien alors que la migration qui les portait n'avait
 * jamais tourné.
 *
 * Le script ne se connecte à rien : il imprime une requête à coller dans le
 * SQL Editor. Aucun identifiant n'est nécessaire, et la même requête vaut pour
 * la prod comme pour un projet de test.
 *
 * Usage :
 *   node scripts/check-migrations-applied.mjs                 # toutes
 *   node scripts/check-migrations-applied.mjs --since 20260701
 */

import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
);

const sinceIdx = process.argv.indexOf("--since");
const since = sinceIdx !== -1 ? process.argv[sinceIdx + 1] : null;

if (sinceIdx !== -1 && !/^\d{8,14}$/.test(since ?? "")) {
  console.error("--since attend un horodatage, par exemple 20260701");
  process.exit(1);
}

const versions = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  // Le nom est `<version>_<slug>.sql` ; la version est tout ce qui précède le
  // premier underscore.
  .map((f) => f.split("_")[0])
  .filter((v) => /^\d{14}$/.test(v))
  .filter((v) => !since || v >= since.padEnd(14, "0"))
  .sort();

if (versions.length === 0) {
  console.error("Aucune migration ne correspond au filtre.");
  process.exit(1);
}

const values = versions.map((v) => `('${v}')`).join(",\n    ");

console.log(`-- ${versions.length} migration(s) du dépôt${since ? ` depuis ${since}` : ""}.
-- Colle ce bloc dans le SQL Editor : il ne renvoie QUE les manquantes.
-- Aucune ligne = tout est appliqué.
with attendues(version) as (
  values
    ${values}
)
select
  a.version                                             as manquante,
  (select count(*) from attendues)                      as total_attendu,
  (select count(*) from attendues a2
     join supabase_migrations.schema_migrations m2
       on m2.version = a2.version)                      as total_applique
from attendues a
left join supabase_migrations.schema_migrations m on m.version = a.version
where m.version is null
order by a.version;`);
