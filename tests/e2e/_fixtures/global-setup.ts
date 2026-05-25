/**
 * Playwright globalSetup — runs once before all E2E tests.
 *
 * Signs in the 4 pre-created E2E users (admin / coach / player / parent),
 * exposes their access tokens + user ids via process.env so the synchronous
 * `admin` client in tests/e2e/_fixtures/admin.ts can attach the admin token
 * as a Bearer header, and so the club fixture can wire the real user ids
 * into team_members / player_parents / etc.
 *
 * Also resolves the pre-existing E2E test club (E2E_CLUB_NAME) and exports
 * its id as E2E_CLUB_ID.
 */
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "coach" | "player" | "parent";

const ENV_KEYS: Record<Role, { email: string; password: string }> = {
  admin: { email: "E2E_ADMIN_EMAIL", password: "E2E_ADMIN_PASSWORD" },
  coach: { email: "E2E_COACH_EMAIL", password: "E2E_COACH_PASSWORD" },
  player: { email: "E2E_PLAYER_EMAIL", password: "E2E_PLAYER_PASSWORD" },
  parent: { email: "E2E_PARENT_EMAIL", password: "E2E_PARENT_PASSWORD" },
};

export default async function globalSetup() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;
  const clubName = process.env.E2E_CLUB_NAME ?? "E2E Test Club";

  if (!url || !anonKey) return; // missing-config test will report

  // Admin is required; the other 3 are optional (fixture will fall back to admin).
  const adminEmail = process.env[ENV_KEYS.admin.email];
  const adminPassword = process.env[ENV_KEYS.admin.password];
  if (!adminEmail || !adminPassword) return;

  async function signIn(role: Role): Promise<string | null> {
    const email = process.env[ENV_KEYS[role].email];
    const password = process.env[ENV_KEYS[role].password];
    if (!email || !password) {
      // eslint-disable-next-line no-console
      console.warn(
        `[globalSetup] ${role}: missing ${ENV_KEYS[role].email}/${ENV_KEYS[role].password} — falling back to admin user for this role.`,
      );
      return null;
    }
    const client = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      throw new Error(
        `[globalSetup] ${role} signIn failed for ${email}: ${error?.message ?? "no session"}. ` +
          "Check the user exists, the password is correct, and the email is confirmed.",
      );
    }
    const upper = role.toUpperCase();
    process.env[`E2E_${upper}_ACCESS_TOKEN`] = data.session.access_token;
    process.env[`E2E_${upper}_REFRESH_TOKEN`] = data.session.refresh_token;
    process.env[`E2E_${upper}_USER_ID`] = data.user.id;
    return data.session.access_token;
  }

  // 1. Sign in admin first — required for the authenticated club lookup below.
  const adminToken = await signIn("admin");
  if (!adminToken) {
    throw new Error("[globalSetup] admin sign-in returned no token");
  }

  // 2. Sign in the other roles in parallel (independent of the club lookup).
  await Promise.all(
    (["coach", "player", "parent"] as Role[]).map((r) => signIn(r)),
  );

  // Fail fast in CI if coach/player/parent creds are missing — otherwise the
  // fixture silently falls back to the admin user and RLS-scoped tests pass
  // for the wrong reason.
  for (const r of ["coach", "player", "parent"] as Role[]) {
    const upper = r.toUpperCase();
    if (!process.env[`E2E_${upper}_USER_ID`]) {
      throw new Error(
        `[globalSetup] E2E_${upper}_EMAIL/E2E_${upper}_PASSWORD missing — ` +
          `multi-role E2E tests require a distinct ${r} user.`,
      );
    }
  }

  // 3. Resolve the pre-existing test club id using an authenticated client
  //    (RLS on `clubs` blocks anonymous SELECT).
  const authedClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  });
  const { data: club, error: clubErr } = await authedClient
    .from("clubs")
    .select("id, name")
    .eq("name", clubName)
    .maybeSingle();
  if (clubErr || !club) {
    throw new Error(
      `[globalSetup] Could not find club "${clubName}". Create it manually and add ${adminEmail} as admin. ` +
        `(${clubErr?.message ?? "not found"})`,
    );
  }
  process.env.E2E_CLUB_ID = club.id;
}
