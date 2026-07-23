#!/usr/bin/env bun
/**
 * Manual / CI helper: ensure E2E users + club exist on the target Supabase project.
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   E2E_TARGET_PROJECT_REF   (must match project ref in SUPABASE_URL)
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_COACH_* / E2E_PLAYER_* / E2E_PARENT_* (recommended)
 *
 * Usage:
 *   bun run scripts/seed-e2e.ts
 */
import { ensureE2ESeed } from "../tests/e2e/_fixtures/ensure-seed";

const result = await ensureE2ESeed(process.env);
if (result.skipped) {
  console.error(`[seed-e2e] skipped: ${result.reason}`);
  process.exit(1);
}
console.log(
  `[seed-e2e] ok — project=${result.projectRef} club=${result.clubId} users=${result.users.length}`,
);
for (const u of result.users) {
  console.log(`  - ${u.role}: ${u.email} (${u.created ? "created" : "updated"}) ${u.userId}`);
}
