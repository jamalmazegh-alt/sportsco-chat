/**
 * Applique la migration billing exemption sur bughunt (pooler IPv4).
 * node --env-file=.env.qa scripts/apply-billing-exemption-migration-bughunt.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const BUGHUNT = "dkcfcifsrnnaqaipfuzi";
const PROD = "woawmhuntajpiezmmgzm";
const POOLER = "aws-0-eu-west-1.pooler.supabase.com";
const MIGRATION = "20260622120000_subscription_billing_exemption.sql";
const __dirname = dirname(fileURLToPath(import.meta.url));

const password = process.env.BUGHUNT_DB_PASSWORD;
if (!password) {
  console.error("❌ BUGHUNT_DB_PASSWORD manquant (.env.qa)");
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

async function columnExists(name) {
  const rows = await sql`
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'subscriptions'
      and column_name = ${name}
  `;
  return rows.length > 0;
}

try {
  const already = await columnExists("exempt_from_billing");
  if (already) {
    console.log("✓ Colonnes exemption déjà présentes — application idempotente des RPC…");
  }

  const file = resolve(__dirname, `../supabase/migrations/${MIGRATION}`);
  const ddl = readFileSync(file, "utf8");
  await sql.unsafe(ddl);

  const ok = await columnExists("exempt_from_billing");
  if (!ok) throw new Error("Colonne exempt_from_billing absente après migration");

  const [{ club_has_active_subscription: rpcOk }] = await sql`
    select pg_get_functiondef(p.oid) like '%exempt_from_billing%'
      as club_has_active_subscription
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'club_has_active_subscription'
  `;
  if (!rpcOk) throw new Error("RPC club_has_active_subscription non mise à jour");

  console.log("✅ Migration billing exemption appliquée sur bughunt");
} finally {
  await sql.end({ timeout: 5 });
}
