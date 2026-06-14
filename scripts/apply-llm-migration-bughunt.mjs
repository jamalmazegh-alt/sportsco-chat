/**
 * Applique la migration LLM sur bughunt (pooler IPv4).
 * npx --yes -p postgres@3.4.5 tsx scripts/apply-llm-migration-bughunt.mjs
 * (ou BUGHUNT_DB_PASSWORD=… en env)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const BUGHUNT = "dkcfcifsrnnaqaipfuzi";
const PROD = "woawmhuntajpiezmmgzm";
const POOLER = "aws-0-eu-west-1.pooler.supabase.com";
const MIGRATION = "20260613131601_c8a88d10-524b-48a3-9186-a740162bc08c.sql";
const __dirname = dirname(fileURLToPath(import.meta.url));

const password = process.env.BUGHUNT_DB_PASSWORD;
if (!password) {
  console.error("❌ BUGHUNT_DB_PASSWORD manquant");
  process.exit(1);
}
if (process.env.SUPABASE_URL?.includes(PROD)) {
  console.error("❌ ABORT: SUPABASE_URL = PROD");
  process.exit(1);
}

const sql = postgres({
  host: POOLER,
  port: 5432,
  database: "postgres",
  username: `postgres.${BUGHUNT}`,
  password,
  ssl: "require",
  max: 1,
});

async function tableExists(name) {
  const rows = await sql`
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = ${name}
  `;
  return rows.length > 0;
}

try {
  const usage = await tableExists("llm_usage");
  const cache = await tableExists("llm_cache");
  if (usage && cache) {
    console.log("✓ Tables llm_usage + llm_cache déjà présentes");
    process.exit(0);
  }

  const file = resolve(__dirname, `../supabase/migrations/${MIGRATION}`);
  const ddl = readFileSync(file, "utf8");
  await sql.unsafe(ddl);

  const usage2 = await tableExists("llm_usage");
  const cache2 = await tableExists("llm_cache");
  if (!usage2 || !cache2) throw new Error("Tables absentes après migration");
  console.log("✅ Migration LLM appliquée sur bughunt");
} finally {
  await sql.end({ timeout: 5 });
}
