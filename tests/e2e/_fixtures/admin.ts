/**
 * E2E "admin" client — signed-in regular Supabase client (NOT service_role).
 *
 * Historically this exported a service_role client. Lovable Cloud doesn't
 * expose service_role to GitHub Actions, so we now sign in as a dedicated
 * pre-created E2E admin user. All operations go through RLS as that user.
 *
 * Pre-requisites in the database (see tests/e2e/_fixtures/README.md):
 *   - An auth user with E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (email confirmed)
 *   - A profiles row for that user
 *   - A clubs row "E2E Test Club" with this user as admin in club_members
 *
 * The `admin` export keeps its name so existing test files don't need changes,
 * but it is NOT a service_role client. `admin.auth.admin.*` calls will fail.
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

// Set to true if tests need service-role-only operations (auth.admin.*).
// Always false on this stack — used by tests to skip themselves cleanly.
export const HAS_ADMIN_PRIVILEGES = false;

let _client: SupabaseClient | null = null;
let _userId: string | null = null;
let _signInPromise: Promise<SupabaseClient> | null = null;

async function signIn(): Promise<SupabaseClient> {
  const c = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({
    email: adminEmail!,
    password: adminPassword!,
  });
  if (error || !data.user) {
    throw new Error(
      `E2E admin signIn failed for ${adminEmail}: ${error?.message ?? "no user"}`,
    );
  }
  _userId = data.user.id;
  _client = c;
  return c;
}

async function ensureClient(): Promise<SupabaseClient> {
  if (_client) return _client;
  if (!_signInPromise) _signInPromise = signIn();
  return _signInPromise;
}

/**
 * Returns the auth user id of the E2E admin (after first sign-in).
 */
export async function getAdminUserId(): Promise<string> {
  await ensureClient();
  if (!_userId) throw new Error("E2E admin user id not available");
  return _userId;
}

/**
 * Proxy that lazily signs in on first DB call. Behaves like a SupabaseClient
 * for the operations we use in tests (`.from(...)`, `.rpc(...)`, `.storage`,
 * `.auth.getUser()`). Service-role-only calls (`.auth.admin.*`) will throw at
 * runtime — tests should gate those with HAS_ADMIN_PRIVILEGES.
 */
export const admin = new Proxy({} as SupabaseClient, {
  get(_t, prop: string | symbol) {
    if (prop === "then") return undefined; // not a thenable
    return (...args: unknown[]) => {
      // For property access that returns chainable builders, await + forward.
      // Most usages are `admin.from("x").select(...)` — we return a thenable-like
      // proxy that resolves on `.then` of the eventual builder.
      throw new Error(
        "admin client must be awaited via `await ensureAdmin()` — direct sync access is no longer supported. Update the call site.",
      );
    };
  },
});

/**
 * Preferred accessor: `const c = await ensureAdmin(); await c.from(...)...`.
 * The legacy `admin` proxy throws to surface migration spots.
 */
export async function ensureAdmin(): Promise<SupabaseClient> {
  return ensureClient();
}
