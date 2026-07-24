/**
 * Playwright globalSetup — runs once before all E2E tests.
 *
 * 1. When SUPABASE_SERVICE_ROLE_KEY + E2E_TARGET_PROJECT_REF are set, idempotently
 *    creates/repairs the 4 E2E users and the "E2E Test Club" so GitHub secrets
 *    stay the source of truth for passwords (fixes nightly "Invalid login credentials").
 * 2. Signs in the 4 users, exposes tokens + user ids via process.env.
 * 3. Resolves E2E_CLUB_ID from the pre-existing / freshly-seeded club.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureE2ESeed, ensureRequiredConsents, E2E_ROLE_ENV, type E2ERole } from "./ensure-seed";

type Role = E2ERole;

const ENV_KEYS = E2E_ROLE_ENV;

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

  // Repair / create fixture users when service_role is available (CI nightly).
  const seed = await ensureE2ESeed(process.env);
  if (seed.skipped) {
    console.log(`[globalSetup] ensure-seed skipped: ${seed.reason}`);
  } else {
    console.log(
      `[globalSetup] ensure-seed ok on ${seed.projectRef} — club ${seed.clubId}, ` +
        `${seed.users.length} users ready`,
    );
    process.env.E2E_CLUB_ID = seed.clubId;
  }

  async function signIn(role: Role): Promise<string | null> {
    const email = process.env[ENV_KEYS[role].email];
    const password = process.env[ENV_KEYS[role].password];
    if (!email || !password) {
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
      const hint = process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "ensure-seed ran but sign-in still failed — check anon key / project mismatch."
        : "Set SUPABASE_SERVICE_ROLE_KEY + E2E_TARGET_PROJECT_REF so globalSetup can auto-repair users, " +
          "or recreate the user manually (see tests/e2e/_fixtures/README.md).";
      throw new Error(
        `[globalSetup] ${role} signIn failed for ${email}: ${error?.message ?? "no session"}. ${hint}`,
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
  await Promise.all((["coach", "player", "parent"] as Role[]).map((r) => signIn(r)));

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
  //    (RLS on `clubs` blocks anonymous SELECT) — unless ensure-seed already set it.
  if (!process.env.E2E_CLUB_ID) {
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
        `[globalSetup] Could not find club "${clubName}". Create it manually and add ${adminEmail} as admin, ` +
          `or provide SUPABASE_SERVICE_ROLE_KEY + E2E_TARGET_PROJECT_REF for auto-seed. ` +
          `(${clubErr?.message ?? "not found"})`,
      );
    }
    process.env.E2E_CLUB_ID = club.id;
  }

  // 4. ConsentGate: always (re)grant required consents after sign-in.
  //    ensure-seed already does this via service_role when available; the
  //    per-user JWT path covers skipped seed and re-applies after version bumps.
  await grantConsentsViaUserTokens(url, anonKey);
}

/**
 * Fallback when service_role seed did not run: each signed-in E2E user inserts
 * their own required consent rows (RLS: user_consents_insert checks auth.uid()).
 */
async function grantConsentsViaUserTokens(url: string, anonKey: string): Promise<void> {
  const roles: E2ERole[] = ["admin", "coach", "player", "parent"];
  for (const role of roles) {
    const upper = role.toUpperCase();
    const token = process.env[`E2E_${upper}_ACCESS_TOKEN`];
    const userId = process.env[`E2E_${upper}_USER_ID`];
    if (!token || !userId) continue;

    const client: SupabaseClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    try {
      await ensureRequiredConsents(client, [userId]);
    } catch (e) {
      console.warn(
        `[globalSetup] consent grant for ${role} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
