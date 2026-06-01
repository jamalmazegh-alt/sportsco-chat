#!/usr/bin/env node
/**
 * Lint check: every server-fn module that imports `supabaseAdmin` (the
 * service-role client which bypasses RLS) must also reference at least one
 * authorization guard token. Otherwise a client-provided id (club_id,
 * user_id, ...) could be used to access cross-tenant data.
 *
 * Allowlisted guard tokens:
 *   - assertSuperAdmin       (from @/lib/authz.server or local helper)
 *   - assertClubRole         (from @/lib/authz.server)
 *   - assertClubAdmin        (legacy local helpers, kept until migrated)
 *   - assertTournamentAdmin
 *   - has_super_admin        (RPC)
 *   - has_club_role / has_club_role_text   (RPC)
 *   - can_manage_tournament_members
 *
 * Files explicitly exempt are listed in ALLOWLIST below — each entry must
 * justify why the file is safe (typically: queries are scoped only by
 * `context.userId`, not by any client-provided id).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

const GUARD_TOKENS = [
  "assertSuperAdmin",
  "assertClubRole",
  "assertClubAdmin",
  "assertTournamentAdmin",
  "assertCanManage",
  "has_super_admin",
  "has_club_role",
  "has_club_role_text",
  "can_manage_tournament_members",
  "can_respond_for_player",
];

// Files exempt from the guard requirement. Each entry MUST include a reason.
const ALLOWLIST = new Set([
  // Inline guard: membership lookup via context.supabase with .eq("role", "admin").
  "src/lib/admin.functions.ts",
  "src/lib/billing.functions.ts",
  "src/lib/insights.functions.ts",
  // All queries scoped strictly by context.userId / parent links — no client-provided clubId trusted.
  "src/lib/payment-family.functions.ts",
  // Public read of legal documents — no per-tenant scoping.
  "src/lib/legal.functions.ts",
]);


// Only server-fn ENTRY POINTS (.functions.ts) are checked. Leaf .server.ts
// helpers cannot be invoked from the client; their callers must hold the guard.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.functions\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST.has(rel)) continue;
  const src = readFileSync(file, "utf8");
  if (!/from\s+["']@\/integrations\/supabase\/client\.server["']/.test(src)) continue;
  if (!/\bsupabaseAdmin\b/.test(src)) continue;
  const hasGuard = GUARD_TOKENS.some((t) => src.includes(t));
  if (!hasGuard) violations.push(rel);
}

if (violations.length) {
  console.error(
    "\n❌ supabaseAdmin used without an authorization guard in:\n" +
      violations.map((v) => "  - " + v).join("\n") +
      "\n\nAdd assertSuperAdmin / assertClubRole (src/lib/authz.server) " +
      "before any cross-tenant query, or add the file to ALLOWLIST in " +
      "scripts/check-server-fn-guards.mjs with a justification.\n",
  );
  process.exit(1);
}
console.log(`✓ server-fn guards OK (${walk(SRC).length} files scanned)`);
