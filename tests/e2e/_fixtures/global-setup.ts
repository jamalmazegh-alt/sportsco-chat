/**
 * Playwright globalSetup — runs once before all E2E tests.
 *
 * Signs in the pre-created E2E admin user against Supabase using
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, then exposes the access token + user
 * id via process.env so the synchronous `admin` client in
 * tests/e2e/_fixtures/admin.ts can attach it as a Bearer header.
 *
 * Also resolves the pre-existing E2E test club (E2E_CLUB_NAME) and exports
 * its id as E2E_CLUB_ID for the club fixture.
 */
import { createClient } from "@supabase/supabase-js";

export default async function globalSetup() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  const clubName = process.env.E2E_CLUB_NAME ?? "E2E Test Club";

  if (!url || !anonKey || !email || !password) {
    // Let the missing-config skip test handle the messaging.
    return;
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(
      `[globalSetup] E2E admin signIn failed for ${email}: ${error?.message ?? "no session"}. ` +
        "Make sure the user exists, the password is correct, and the email is confirmed.",
    );
  }

  process.env.E2E_ADMIN_ACCESS_TOKEN = data.session.access_token;
  process.env.E2E_ADMIN_REFRESH_TOKEN = data.session.refresh_token;
  process.env.E2E_ADMIN_USER_ID = data.user.id;

  // Resolve the pre-existing test club id (RLS: admin must be a member).
  const { data: club, error: clubErr } = await client
    .from("clubs")
    .select("id")
    .eq("name", clubName)
    .maybeSingle();
  if (clubErr || !club) {
    throw new Error(
      `[globalSetup] Could not find club "${clubName}". Create it manually and add ${email} as admin. ` +
        `(${clubErr?.message ?? "not found"})`,
    );
  }
  process.env.E2E_CLUB_ID = club.id;
}
