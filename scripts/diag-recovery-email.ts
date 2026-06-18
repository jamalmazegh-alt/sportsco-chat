/**
 * Diagnostic: password reset email pipeline
 * Run: npx tsx scripts/diag-recovery-email.ts [email]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env.qa"));

const email = process.argv[2]?.trim();
const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log("=== Config ===");
  console.log("SUPABASE_URL:", url ?? "MISSING");
  console.log("SERVICE_ROLE_KEY:", key ? "set" : "MISSING");
  console.log("LOVABLE_API_KEY:", process.env.LOVABLE_API_KEY ? "set" : "MISSING");
  console.log("LOVABLE_SEND_URL:", process.env.LOVABLE_SEND_URL ?? "(default)");

  if (!url || !key) {
    console.error("\nCannot query logs without Supabase credentials.");
    process.exit(1);
  }

  const db = createClient(url, key);

  // Recent recovery-related email logs
  let q = db
    .from("email_send_log")
    .select("created_at, template_name, recipient_email, status, error_message")
    .eq("template_name", "recovery")
    .order("created_at", { ascending: false })
    .limit(15);

  if (email) q = q.eq("recipient_email", email);

  const { data: logs, error: logErr } = await q;
  if (logErr) console.error("email_send_log error:", logErr.message);
  else {
    console.log("\n=== Recent recovery emails (email_send_log) ===");
    console.log(logs?.length ? logs : "(none)");
  }

  // Queue depth
  for (const queue of ["auth_emails", "auth_emails_dlq"]) {
    const { count, error } = await db
      .from(`pgmq.q_${queue}` as "email_send_log")
      .select("*", { count: "exact", head: true })
      .limit(0);
    // pgmq tables may not be exposed via REST — try RPC or raw
    if (error) console.log(`\nQueue ${queue}: (not queryable via REST — ${error.message.slice(0, 80)})`);
    else console.log(`\nQueue ${queue}: ${count ?? 0} messages`);
  }

  // Email send state
  const { data: state } = await db.from("email_send_state").select("*").maybeSingle();
  console.log("\n=== email_send_state ===");
  console.log(state ?? "(none)");

  // Trigger a reset if email provided (dry info only)
  if (email) {
    const anon = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!);
    const { error } = await anon.auth.resetPasswordForEmail(email, {
      redirectTo: "https://clubero.app/reset-password",
    });
    console.log("\n=== resetPasswordForEmail trigger ===");
    console.log(error ? `ERROR: ${error.message}` : "OK (no client error — check logs in ~30s)");
  }
}

main().catch(console.error);
