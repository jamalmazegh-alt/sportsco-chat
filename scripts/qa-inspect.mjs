#!/usr/bin/env node
/**
 * QA bughunt — inspection lecture seule.
 * Affiche : clubs (is_personal), club_members (role/roles), users auth liés.
 * Aucune écriture. Charge .env.qa (service role) localement.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(path.join(root, ".env.qa"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (url.includes("woawmhuntajpiezmmgzm")) {
  console.error("REFUS: cible PROD.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: clubs } = await sb
  .from("clubs")
  .select("id,name,is_personal")
  .order("name");
console.log("\n=== CLUBS ===");
for (const c of clubs ?? []) {
  console.log(`${c.id}  personal=${c.is_personal}  ${c.name}`);
}

const { data: members } = await sb
  .from("club_members")
  .select("club_id,user_id,role,roles")
  .in("role", ["admin", "dirigeant"]);
console.log("\n=== MEMBERS admin/dirigeant ===");
for (const m of members ?? []) {
  console.log(`club=${m.club_id} user=${m.user_id} role=${m.role} roles=${JSON.stringify(m.roles)}`);
}

const { data: authUsers } = await sb.auth.admin.listUsers({ page: 1, perPage: 50 });
console.log("\n=== AUTH USERS ===");
for (const u of authUsers?.users ?? []) {
  console.log(`${u.id}  ${u.email}  confirmed=${!!u.email_confirmed_at}`);
}
console.log("\nDone.");
