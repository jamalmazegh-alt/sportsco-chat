/**
 * E2E "admin" client — a regular Supabase client authenticated as the
 * pre-created E2E admin user (NOT service_role).
 *
 * Why no service_role? Lovable Cloud doesn't expose the service_role key to
 * GitHub Actions. So we sign in once in playwright globalSetup as a dedicated
 * E2E admin user (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD), stash the access
 * token in process.env.E2E_ADMIN_ACCESS_TOKEN, and create a synchronous
 * client here that sends that token on every request. All operations go
 * through RLS as that user, so the user must be admin of the E2E test club.
 *
 * The `admin` export keeps its name so existing test files don't need
 * changes, but it is NOT a service_role client. `admin.auth.admin.*` calls
 * (createUser / listUsers / updateUserById / deleteUser) are unavailable —
 * gate those tests with HAS_ADMIN_PRIVILEGES.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const clubName = process.env.E2E_CLUB_NAME ?? "E2E Test Club";

if (!url || !anonKey || !adminEmail || !adminPassword) {
  throw new Error(
    "E2E tests require SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD env vars.",
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;
export const E2E_ADMIN_EMAIL = adminEmail;
export const E2E_ADMIN_PASSWORD = adminPassword;
export const E2E_CLUB_NAME = clubName;

/**
 * False on this stack — used by tests that need service-role-only operations
 * (auth.admin.createUser, listUsers, etc.) to skip themselves cleanly.
 */
export const HAS_ADMIN_PRIVILEGES = false;

const accessToken = process.env.E2E_ADMIN_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error(
    "E2E_ADMIN_ACCESS_TOKEN is missing. Playwright globalSetup must run first to sign in the E2E admin user.",
  );
}

/**
 * Pre-authenticated Supabase client. Every request carries the E2E admin's
 * bearer token, so RLS sees this user. Use it like a normal client:
 *   await admin.from("clubs").select("*")
 */
export const admin: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${accessToken}` } },
});

export const E2E_ADMIN_USER_ID = process.env.E2E_ADMIN_USER_ID ?? "";
